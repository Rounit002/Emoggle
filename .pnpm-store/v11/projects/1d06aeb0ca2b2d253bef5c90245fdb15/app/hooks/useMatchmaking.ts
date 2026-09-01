"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Peer, { MediaConnection } from "peerjs";
import { UserProfile } from "../context/UserProfileContext";

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

const STREAM_TIMEOUT_MS = 12_000;

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? "",
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "",
    });
  }
  return servers;
}

export type MatchStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "matched"
  | "stopped"
  | "error";

export interface ChatMessage {
  text: string;
  fromSelf: boolean;
  ts: number;
}

export interface MatchResult {
  matchId: string;
  myScore: number;
  partnerScore: number;
  winner: "you" | "rival" | "tie";
  winnerSocketId: string | null;
  myElo?: number;
  partnerElo?: number;
  myEloDelta?: number;
  partnerEloDelta?: number;
  myTier?: string;
  partnerTier?: string;
}

export interface MatchmakingState {
  status: MatchStatus;
  remoteStream: MediaStream | null;
  localPeerId: string | null;
  partnerPeerId: string | null;
  countdown: number | null;
  partnerScore: number | null;
  partnerLiveScore: number | null;
  matchResult: MatchResult | null;
  emojiPrompt: string | null;
  /**
   * True once the scan window has opened (server fired
   * `emoji_locked`). The "change emoji" control must dim at the
   * same moment on both screens — never trust the local clock for
   * this, always wait for the server's broadcast.
   */
  emojiLocked: boolean;
  /**
   * Partner's display name, relayed through the signaling
   * channel at match start. Null until `match_started` fires.
   */
  partnerName: string | null;
  /**
   * Partner's country as a "🇮🇳 India" style label. Relayed
   * through the signaling channel at match start; null when the
   * partner's geo lookup failed.
   */
  partnerCountry: string | null;
  /**
   * Partner's 2-letter ISO country code ("IN", "US", "GB"). The
   * canonical wire format — clients should prefer this over
   * `partnerCountry` and derive the flag via `isoFlag()` so a
   * glitched display string never makes the flag look like a
   * country code. Null when the partner didn't supply one.
   */
  partnerCountryCode: string | null;
  /**
   * Identifier for the currently-active match. Set as soon as the
   * server fires `match_started` and cleared when the match ends
   * (skip, disconnect, completion). Distinct from `matchResult.id`
   * because the result only exists once the round has been scored —
   * callers that want to react to "we got paired with someone"
   * need this instead.
   */
  currentMatchId: string | null;
  submitScore: (score: number) => void;
  submitLiveScore: (score: number) => void;
  skipUser: () => void;
  stopMatching: () => void;
  startMatching: () => void;
  /**
   * Ask the server to roll a new target emoji for the current
   * match. The server is the single source of truth: it picks the
   * next emoji, updates the DB, and fans it out to the room via
   * `emoji_changed` so both clients update in lockstep. Silently
   * no-ops if the round is locked.
   */
  requestChangeEmoji: () => void;
  messages: ChatMessage[];
  sendChat: (text: string) => void;
  rivalTyping: boolean;
  sendTyping: (isTyping: boolean) => void;
  /**
   * Flag the current partner for moderation. The server is the
   * authoritative sink — it logs the session context (match id,
   * reporter user id, partner user id, timestamp) and can later
   * persist it to a moderation table. The view layer never holds
   * identity info about the partner beyond what the server
   * already trusts (userId, peerId).
   */
  reportPartner: () => void;
}

export function useMatchmaking(
  localStream: MediaStream | null,
  /**
   * Local player's display name (already validated). Sent to the
   * server in `join_queue` and relayed to the partner in
   * `match_started`. The server never persists it.
   */
  myName: string | null = null,
  /**
   * Local player's country, formatted as a "🇮🇳 India" label
   * (flag + display name). Sent to the server in `join_queue` and
   * relayed to the partner. The server never persists it.
   */
  myCountry: string | null = null,
  /**
   * Local player's 2-letter ISO country code (e.g. "IN"). This is
   * the preferred wire format: small, unambiguous, and lets the
   * receiving client render the flag via `isoFlag()` so a
   * sender-side display glitch never makes the partner see
   * "IN" where they should see 🇮🇳.
   */
  myCountryCode: string | null = null,
  profile: UserProfile | null = null,
  onProfileUpdate?: (profile: UserProfile) => void,
  sessionToken?: string | null
): MatchmakingState {
  const profileRef = useRef<UserProfile | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const currentMatchIdRef = useRef<string | null>(null);

  // Keep the latest player name + country in refs so the socket
  // event listeners (which capture the value at registration
  // time) can still see the freshest values when `join_queue`
  // is fired. Updated in a layout-style effect after each render.
  const identityRef = useRef<{
    name: string | null;
    country: string | null;
    countryCode: string | null;
  }>({
    name: myName,
    country: myCountry,
    countryCode: myCountryCode,
  });
  useEffect(() => {
    identityRef.current = {
      name: myName,
      country: myCountry,
      countryCode: myCountryCode,
    };
  }, [myName, myCountry, myCountryCode]);

  const onProfileUpdateRef = useRef<((profile: UserProfile) => void) | undefined>(undefined);

  const [status, setStatus] = useState<MatchStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [partnerPeerId, setPartnerPeerId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);
  const [partnerLiveScore, setPartnerLiveScore] = useState<number | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [emojiPrompt, setEmojiPrompt] = useState<string | null>(null);
  const [emojiLocked, setEmojiLocked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rivalTyping, setRivalTyping] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [partnerCountryCode, setPartnerCountryCode] = useState<string | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);

  useEffect(() => {
    profileRef.current = profile;
    onProfileUpdateRef.current = onProfileUpdate;
  }, [profile, onProfileUpdate]);

  const buildJoinPayload = useCallback((peerId: string) => {
    const { name, country, countryCode } = identityRef.current;
    return {
      peerId,
      // All three fields are optional on the server. Trimmed,
      // length-bounded, and never persisted — the server keeps
      // them in socketMeta (in-memory) only for the duration of
      // the session and discards them on disconnect.
      name: name ?? null,
      country: country ?? null,
      countryCode: countryCode ?? null,
    };
  }, []);

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  /* Keep a ref in sync so timeout callbacks can read the latest value */
  const setRemoteStreamSynced = useCallback(
    (stream: MediaStream | null) => {
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
      if (stream) clearStreamTimeout();
    },
    [clearStreamTimeout]
  );

  const resetMatchState = useCallback(() => {
    clearStreamTimeout();
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    setRemoteStreamSynced(null);
    setPartnerPeerId(null);
    setCountdown(null);
    setPartnerScore(null);
    setPartnerLiveScore(null);
    setMatchResult(null);
    setEmojiPrompt(null);
    setEmojiLocked(false);
    setMessages([]);
    setRivalTyping(false);
    setPartnerName(null);
    setPartnerCountry(null);
    setPartnerCountryCode(null);
    currentMatchIdRef.current = null;
    setCurrentMatchId(null);
  }, [clearStreamTimeout, setRemoteStreamSynced]);

  /* Re-join queue after a failed connection (silent recovery) */
  const rejoinQueue = useCallback(() => {
    resetMatchState();
    setStatus("waiting");
    const peerId = peerRef.current?.id;
    if (peerId && socketRef.current?.connected) {
      socketRef.current.emit("join_queue", buildJoinPayload(peerId));
    }
  }, [buildJoinPayload, resetMatchState]);

  /* Start a timeout — if no stream arrives within STREAM_TIMEOUT_MS, re-queue */
  const startStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      if (!remoteStreamRef.current) {
        console.warn("[PeerJS] No stream after", STREAM_TIMEOUT_MS, "ms — re-queuing");
        rejoinQueue();
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout, rejoinQueue]);

  /* ── Helper: answer an incoming call ── */
  const answerCall = useCallback(
    (call: MediaConnection, stream: MediaStream) => {
      callRef.current = call;
      call.answer(stream);
      call.on("stream", (remote) => setRemoteStreamSynced(remote));
      call.on("close", () => setRemoteStreamSynced(null));
      call.on("error", (err) => console.error("[PeerJS call]", err));
    },
    [setRemoteStreamSynced]
  );

  /* ── Helper: place an outgoing call ── */
  const placeCall = useCallback(
    (peer: Peer, targetPeerId: string, stream: MediaStream) => {
      const call = peer.call(targetPeerId, stream);
      callRef.current = call;
      call.on("stream", (remote) => setRemoteStreamSynced(remote));
      call.on("close", () => setRemoteStreamSynced(null));
      call.on("error", (err) => console.error("[PeerJS call]", err));
    },
    [setRemoteStreamSynced]
  );

  useEffect(() => {
    if (!localStream || !sessionToken) return;

    setStatus("connecting");

    /* ── 1. Create PeerJS instance with multiple STUN + optional TURN ── */
    const peer = new Peer({ config: { iceServers: buildIceServers() } });
    peerRef.current = peer;

    peer.on("open", (id) => {
      setLocalPeerId(id);

      /* ── 2. Connect to signaling server ── */
      const socket = io(SIGNALING_URL, {
        transports: ["websocket", "polling"],
        withCredentials: true,
        auth: { token: sessionToken },
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join_queue", buildJoinPayload(id));
        setStatus("waiting");
      });

      socket.on("connect_error", (error) => {
        console.error("[Signaling] Secure connection failed:", error.message);
        setStatus("error");
      });

      socket.on("server_error", ({ detail }: { detail?: string }) => {
        console.error("[Signaling]", detail || "Server rejected the request");
        setStatus("error");
      });

      socket.on("waiting", () => {
        if (!stoppedRef.current) setStatus("waiting");
      });

      socket.on("usage_update", ({ isVIP }: { isVIP?: boolean }) => {
        if (!profileRef.current) return;
        const nextProfile = {
          ...profileRef.current,
          isVIP: isVIP ?? profileRef.current.isVIP,
        };
        profileRef.current = nextProfile;
        onProfileUpdateRef.current?.(nextProfile);
      });

      // Persist server-assigned UUID even if user skipped onboarding
      socket.on("user_id", ({ userId }: { userId?: string }) => {
        if (!userId) return;
        const current = profileRef.current;
        if (!current) return;
        if (typeof current.userId === "string" && current.userId.length > 0) return;
        const nextProfile = { ...current, userId };
        profileRef.current = nextProfile;
        onProfileUpdateRef.current?.(nextProfile);
      });

      const handleMatchStarted = (
        {
          matchId,
          partnerPeerId: ppId,
          role,
          emoji,
          partnerCountry: pc,
          partnerCountryCode: pcc,
          partnerName: pn,
        }: {
          matchId?: string;
          partnerPeerId: string;
          role: string;
          emoji?: string;
          partnerCountry?: string | null;
          partnerCountryCode?: string | null;
          partnerName?: string | null;
        }
      ) => {
          stoppedRef.current = false;
          callRef.current?.close();
          callRef.current = null;
          setRemoteStreamSynced(null);
          setPartnerPeerId(ppId);
          setEmojiPrompt(emoji ?? "\u{1F600}");
          // Each new match starts with a fresh mutable emoji.
          // The server flips this back to true when the scan
          // window opens, via the emoji_locked broadcast.
          setEmojiLocked(false);
          setCountdown(null);
          setPartnerScore(null);
          setPartnerLiveScore(null);
          setMatchResult(null);
          setMessages([]);
          setPartnerName(typeof pn === "string" && pn ? pn : null);
          setPartnerCountry(pc ?? null);
          setPartnerCountryCode(typeof pcc === "string" && pcc ? pcc.toUpperCase() : null);
          const nextMatchId = typeof matchId === "string" && matchId ? matchId : null;
          currentMatchIdRef.current = nextMatchId;
          setCurrentMatchId(nextMatchId);
          setStatus("matched");
          startStreamTimeout();

          if (role === "caller") {
            placeCall(peer, ppId, localStream);
          }
          /* receiver waits for the incoming call below */
      };

      socket.on("match_started", handleMatchStarted);
      socket.on("match_found", handleMatchStarted);

      /* ── 3. Handle countdown sync from server ── */
      socket.on("countdown_tick", ({ count }: { count: number }) => {
        setCountdown(count);
      });

      socket.on("scores_ready", ({ partnerScore: ps }: { myScore: number; partnerScore: number }) => {
        setPartnerScore(ps);
      });

      socket.on("partner_score", ({ score }: { score: number }) => {
        setPartnerScore(score);
      });

      socket.on("match_result", (result: MatchResult) => {
        // Ignore a late packet from a match that has already been
        // left/replaced. For the active match, the first finalized
        // payload wins so duplicate socket delivery cannot mutate an
        // already-rendered result.
        if (!result || result.matchId !== currentMatchIdRef.current) return;
        if (!Number.isFinite(result.myScore) || !Number.isFinite(result.partnerScore)) return;
        setMatchResult((previous) =>
          previous?.matchId === result.matchId ? previous : Object.freeze({ ...result }),
        );
        setPartnerScore(result.partnerScore);
      });

      socket.on("partner_live_score", ({ score }: { score: number }) => {
        setPartnerLiveScore(score);
      });

      // Server-driven emoji swap. Both clients receive the same
      // broadcast, so the target emoji can't drift between screens
      // even briefly. The server is also responsible for picking
      // the new emoji (so the "exclude the current one" rule lives
      // next to the random picker, not in two competing clients).
      socket.on("emoji_changed", ({ emoji: next }: { emoji: string }) => {
        if (typeof next === "string" && next.length > 0) {
          setEmojiPrompt(next);
        }
      });

      // Fired by the server the instant the scan window opens.
      // The "change emoji" control on both clients goes dim at
      // exactly the same moment.
      socket.on("emoji_locked", () => {
        setEmojiLocked(true);
      });

      socket.on("match_skipped", () => {
        resetMatchState();
        if (!stoppedRef.current) {
          setStatus("waiting");
        } else {
          setStatus("stopped");
        }
      });

      socket.on("opponent_left", () => {
        resetMatchState();
        if (!stoppedRef.current) setStatus("waiting");
      });

      socket.on("match_ended", () => {
        resetMatchState();
        if (!stoppedRef.current) setStatus("waiting");
      });

      socket.on("chat_message", ({ text }: { text: string; fromSelf: boolean }) => {
        setMessages((prev) => [...prev, { text, fromSelf: false, ts: Date.now() }]);
        setRivalTyping(false);
      });

      socket.on("rival_typing", ({ isTyping }: { isTyping: boolean }) => {
        setRivalTyping(isTyping);
      });

      socket.on("partner_country", ({ country }: { country: string }) => {
        setPartnerCountry(country);
      });

      socket.on("disconnect", () => {
        setStatus("idle");
        setRemoteStreamSynced(null);
      });
    });

    /* ── 4. Answer incoming calls (receiver role) ── */
    peer.on("call", (call) => {
      answerCall(call, localStream);
    });

    peer.on("error", (err) => {
      console.error("[PeerJS]", err.type, err.message);
      if (err.type === "peer-unavailable") {
        /* Partner disconnected before WebRTC handshake — silently re-queue */
        console.warn("[PeerJS] peer-unavailable — re-queuing silently");
        rejoinQueue();
      } else if (
        err.type === "network" ||
        err.type === "socket-error" ||
        err.type === "socket-closed" ||
        err.type === "disconnected"
      ) {
        /* Transient PeerJS server issue — stay in waiting so user can retry */
        setStatus("waiting");
      } else {
        setStatus("error");
      }
    });

    return () => {
      clearStreamTimeout();
      callRef.current?.close();
      peerRef.current?.destroy();
      socketRef.current?.disconnect();
      setStatus("idle");
      resetMatchState();
    };
  }, [localStream, sessionToken, answerCall, placeCall, resetMatchState, rejoinQueue, startStreamTimeout, clearStreamTimeout, setRemoteStreamSynced, buildJoinPayload]);

  const submitScore = useCallback((score: number) => {
    socketRef.current?.emit("submit_score", { score });
  }, []);

  const submitLiveScore = useCallback((score: number) => {
    socketRef.current?.emit("live_score", { score });
  }, []);

  const requestChangeEmoji = useCallback(() => {
    // The hook intentionally doesn't gate this on emojiLocked
    // locally — the server is the only authority. If the user
    // mashes the button after the lock the server just drops the
    // event; both clients stay in sync.
    socketRef.current?.emit("change_emoji");
  }, []);

  const skipUser = useCallback(() => {
    resetMatchState();
    setStatus("waiting");
    socketRef.current?.emit("skip_user");
  }, [resetMatchState]);

  const stopMatching = useCallback(() => {
    stoppedRef.current = true;
    resetMatchState();
    setStatus("stopped");
    socketRef.current?.emit("stop_matching");
  }, [resetMatchState]);

  const startMatching = useCallback(() => {
    stoppedRef.current = false;
    resetMatchState();
    setStatus("waiting");
    const peerId = peerRef.current?.id;
    if (peerId && socketRef.current?.connected) {
      socketRef.current.emit("join_queue", buildJoinPayload(peerId));
    }
  }, [buildJoinPayload, resetMatchState]);

  const sendChat = useCallback((text: string) => {
    if (!text.trim()) return;
    socketRef.current?.emit("typing", { isTyping: false });
    socketRef.current?.emit("chat_message", { text });
    setMessages((prev) => [...prev, { text, fromSelf: true, ts: Date.now() }]);
  }, []);

  const sendTyping = useCallback((isTyping: boolean) => {
    socketRef.current?.emit("typing", { isTyping });
  }, []);

  const reportPartner = useCallback(() => {
    // Fire-and-forget: the server logs the report and is free to
    // ignore it if the user is not currently in a match. We do
    // not block on a response — the view just needs the call to
    // land on the wire.
    socketRef.current?.emit("report_player");
  }, []);

  return {
    status,
    remoteStream,
    localPeerId,
    partnerPeerId,
    countdown,
    partnerScore,
    partnerLiveScore,
    matchResult,
    emojiPrompt,
    emojiLocked,
    partnerName,
    partnerCountry,
    partnerCountryCode,
    currentMatchId,
    submitScore,
    submitLiveScore,
    skipUser,
    stopMatching,
    startMatching,
    requestChangeEmoji,
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    reportPartner,
  };
}
