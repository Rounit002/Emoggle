"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Peer, { MediaConnection } from "peerjs";
import { UserProfile } from "../context/UserProfileContext";
import type { CelebrityTarget } from "../lib/celebrityScoring";
import type {
  FaceSyncCategory,
  FaceSyncResult,
  FaceVector,
} from "../lib/faceSync/types";
import {
  ServerClock,
  buildRoundSchedule,
  scheduleChanged,
  type RoundSchedule,
  type RoundSchedulePayload,
} from "../lib/serverClock";

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

/** Round rules and view requested by this client. */
export type MatchGameMode = "emoji" | "celebrity" | "facesync";

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
  /**
   * Celebrity reference for the current round. Populated by
   * the server on every match_started event in this build so
   * the celebrity arena can render the same target image on
   * both screens. Null in legacy emoji-only clients.
   */
  celebrity?: { id: number | null; name: string | null } | null;
}

export interface MatchmakingState {
  status: MatchStatus;
  remoteStream: MediaStream | null;
  localPeerId: string | null;
  partnerPeerId: string | null;
  /**
   * Raw `countdown_tick` value from the server (3, 2, 1, 0).
   * The arenas render their countdown from `roundSchedule`
   * instead — this stays as the unprocessed server signal.
   */
  countdown: number | null;
  /**
   * The round's phase boundaries as absolute local-clock
   * timestamps. The countdown deadline comes from the server's
   * shared schedule; the 10s scan window is measured from the
   * moment this device received the "go" packet, so a slow link
   * costs a later finish rather than a shorter round. Driving the
   * arena off these instead of a counting interval is what keeps a
   * phone and a desktop on the same beat. Null outside an active
   * round.
   */
  roundSchedule: RoundSchedule | null;
  partnerScore: number | null;
  partnerLiveScore: number | null;
  matchResult: MatchResult | null;
  emojiPrompt: string | null;
  /**
   * The full celebrity target (id, name, imageUrl, etc.) for the
   * currently active round. Captured from the server's
   * `match_started` event so the celebrity arena can render the
   * reference photo + run its peak scorer against the
   * `expressionProfile` without re-querying the backend. Null in
   * the legacy emoji duel.
   */
  currentCelebrity: CelebrityTarget | null;
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
  /**
   * The authoritative FaceSync result for the current match, or
   * null before it lands. Computed once by the server from both
   * players' geometry, so both clients hold the same object.
   */
  faceSyncResult: FaceSyncResult | null;
  /**
   * The match id FaceSync was bypassed for. Set when the server
   * says no result is coming — one side had no face, or the
   * collection window ran out — so the arena can drop straight
   * into the emoji round.
   */
  faceSyncSkippedFor: string | null;
  /** Publish this device's geometry, or null for "nothing to offer". */
  sendFaceSyncSample: (vector: FaceVector | null) => void;
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
  sessionToken?: string | null,
  gameMode: MatchGameMode = "emoji",
  modeSwitchTicket?: string | null,
  onModeSwitch?: (mode: MatchGameMode, ticket: string) => void,
): MatchmakingState {
  const profileRef = useRef<UserProfile | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const onModeSwitchRef = useRef(onModeSwitch);
  useEffect(() => { onModeSwitchRef.current = onModeSwitch; }, [onModeSwitch]);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const pendingCallRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const partnerPeerIdRef = useRef<string | null>(null);
  const matchRoleRef = useRef<"caller" | "receiver" | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const currentMatchIdRef = useRef<string | null>(null);
  const serverClockRef = useRef<ServerClock | null>(null);

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
  const [roundSchedule, setRoundSchedule] = useState<RoundSchedule | null>(null);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);
  const [partnerLiveScore, setPartnerLiveScore] = useState<number | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [emojiPrompt, setEmojiPrompt] = useState<string | null>(null);
  const [currentCelebrity, setCurrentCelebrity] = useState<CelebrityTarget | null>(null);
  const [emojiLocked, setEmojiLocked] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rivalTyping, setRivalTyping] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [partnerCountryCode, setPartnerCountryCode] = useState<string | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [faceSyncResult, setFaceSyncResult] = useState<FaceSyncResult | null>(null);
  const [faceSyncSkippedFor, setFaceSyncSkippedFor] = useState<string | null>(null);

  useEffect(() => {
    profileRef.current = profile;
    onProfileUpdateRef.current = onProfileUpdate;
  }, [profile, onProfileUpdate]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

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
      gameMode,
      ticket: modeSwitchTicket ?? null,
    };
  }, [gameMode, modeSwitchTicket]);

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
    pendingCallRef.current?.close();
    pendingCallRef.current = null;
    partnerPeerIdRef.current = null;
    matchRoleRef.current = null;
    setRemoteStreamSynced(null);
    setPartnerPeerId(null);
    setCountdown(null);
    setRoundSchedule(null);
    setPartnerScore(null);
    setPartnerLiveScore(null);
    setMatchResult(null);
    setEmojiPrompt(null);
    setCurrentCelebrity(null);
    setEmojiLocked(false);
    setMessages([]);
    setRivalTyping(false);
    setPartnerName(null);
    setPartnerCountry(null);
    setPartnerCountryCode(null);
    setFaceSyncResult(null);
    setFaceSyncSkippedFor(null);
    currentMatchIdRef.current = null;
    setCurrentMatchId(null);
  }, [clearStreamTimeout, setRemoteStreamSynced]);

  /*
   * A slow/blocked PeerJS stream must not cancel the Socket.io match.
   * Countdown, scoring, and results remain valid without remote video.
   */
  const startStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      if (!remoteStreamRef.current) {
        console.warn(
          "[PeerJS] No remote video after",
          STREAM_TIMEOUT_MS,
          "ms — keeping the active match connected",
        );
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout]);

  /* ── Helper: answer an incoming call ── */
  const answerCall = useCallback(
    (call: MediaConnection) => {
      const stream = localStreamRef.current;
      if (!stream) {
        pendingCallRef.current?.close();
        pendingCallRef.current = call;
        return;
      }
      pendingCallRef.current = null;
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
    (peer: Peer, targetPeerId: string) => {
      const stream = localStreamRef.current;
      if (!stream || callRef.current) return;
      const call = peer.call(targetPeerId, stream);
      callRef.current = call;
      call.on("stream", (remote) => setRemoteStreamSynced(remote));
      call.on("close", () => setRemoteStreamSynced(null));
      call.on("error", (err) => console.error("[PeerJS call]", err));
    },
    [setRemoteStreamSynced]
  );

  /*
   * Socket matchmaking starts independently of camera permission. If media
   * becomes available after a match is formed, finish the deferred PeerJS
   * handshake without reconnecting or replacing the socket match.
   */
  useEffect(() => {
    if (!localStream) return;
    const pendingCall = pendingCallRef.current;
    if (pendingCall) {
      answerCall(pendingCall);
      return;
    }
    if (
      matchRoleRef.current === "caller" &&
      partnerPeerIdRef.current &&
      peerRef.current &&
      !callRef.current
    ) {
      placeCall(peerRef.current, partnerPeerIdRef.current);
    }
  }, [answerCall, localStream, placeCall]);

  useEffect(() => {
    if (!sessionToken) return;

    /* ── 1. Create PeerJS instance with multiple STUN + optional TURN ── */
    const peer = new Peer({ config: { iceServers: buildIceServers() } });
    peerRef.current = peer;

    peer.on("open", (id) => {
      setStatus("connecting");
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

      // One clock per connection. Sync starts immediately so the
      // offset is settled well before the first match_started
      // arrives.
      const serverClock = new ServerClock();
      serverClockRef.current = serverClock;

      /*
       * Local timestamp at which this device received the server's
       * "go" packet for the current round, or null while the round
       * has not started yet. The 10-second scan window is measured
       * from here, so a player whose packet arrived late still gets
       * the whole window rather than the tail of someone else's.
       */
      let goAnchor: number | null = null;

      /**
       * Adopt (or refine) the round timeline carried by a server
       * event. Every round event repeats the schedule, so a client
       * that missed `match_started` still converges on the same
       * countdown as its opponent. Once `goAnchor` is set it pins
       * the scan window; the server's own scan times are only the
       * prediction used before the "go" packet lands.
       */
      const applySchedule = (payload: RoundSchedulePayload, matchId: string | null) => {
        const next = buildRoundSchedule(payload, serverClock, matchId, Date.now(), goAnchor);
        setRoundSchedule((previous) => (scheduleChanged(previous, next) ? next : previous));
      };

      /** The round is go: start this device's timer from right now. */
      const startScanWindow = (payload: RoundSchedulePayload) => {
        if (goAnchor === null) goAnchor = Date.now();
        applySchedule(payload, currentMatchIdRef.current);
      };

      socket.on("connect", () => {
        serverClock.attach(socket);
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

      socket.on("switch_mode", ({ gameMode: nextMode, ticket }: { gameMode?: string; ticket?: string }) => {
        if (stoppedRef.current || typeof ticket !== "string") return;
        if (nextMode !== "emoji" && nextMode !== "celebrity" && nextMode !== "facesync") return;
        onModeSwitchRef.current?.(nextMode, ticket);
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
        payload: {
          matchId?: string;
          partnerPeerId: string;
          role: string;
          emoji?: string;
          partnerCountry?: string | null;
          partnerCountryCode?: string | null;
          partnerName?: string | null;
          celebrity?: CelebrityTarget;
        } & RoundSchedulePayload
      ) => {
          const {
            matchId,
            partnerPeerId: ppId,
            role,
            emoji,
            partnerCountry: pc,
            partnerCountryCode: pcc,
            partnerName: pn,
            celebrity,
            ...schedule
          } = payload;
          stoppedRef.current = false;
          callRef.current?.close();
          callRef.current = null;
          setRemoteStreamSynced(null);
          partnerPeerIdRef.current = ppId;
          matchRoleRef.current = role === "caller" ? "caller" : "receiver";
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
          setCurrentCelebrity(celebrity ?? null);
          setMessages([]);
          // A new stranger must never inherit the previous one's
          // number, even when the two matches arrive back to back
          // with no reset in between (which is exactly what
          // `skip_user` produces).
          setFaceSyncResult(null);
          setFaceSyncSkippedFor(null);
          setPartnerName(typeof pn === "string" && pn ? pn : null);
          setPartnerCountry(pc ?? null);
          setPartnerCountryCode(typeof pcc === "string" && pcc ? pcc.toUpperCase() : null);
          const nextMatchId = typeof matchId === "string" && matchId ? matchId : null;
          currentMatchIdRef.current = nextMatchId;
          setCurrentMatchId(nextMatchId);
          // A new round: forget the previous round's "go" packet and
          // adopt the server's countdown timeline before anything
          // renders.
          goAnchor = null;
          applySchedule(schedule, nextMatchId);
          setStatus("matched");
          startStreamTimeout();

          if (role === "caller") {
            placeCall(peer, ppId);
          }
          /* receiver waits for the incoming call below */
      };

      socket.on("match_started", handleMatchStarted);
      socket.on("match_found", handleMatchStarted);

      /* ── 3. Handle countdown sync from server ── */
      // The tick is a redundant nudge: it re-publishes the schedule
      // so a dropped or delayed `match_started` can't leave one
      // screen counting on its own timeline.
      socket.on("countdown_tick", ({ count, ...schedule }: { count: number } & RoundSchedulePayload) => {
        if (schedule.matchId && schedule.matchId !== currentMatchIdRef.current) return;
        setCountdown(count);
        // A zero tick is sent at the same instant as the "go"
        // packet, so it stands in as the start signal if it happens
        // to be delivered first.
        if (count <= 0) startScanWindow(schedule);
        else applySchedule(schedule, currentMatchIdRef.current);
      });

          /*
       * FaceSync. The server computes the similarity from both
       * players' geometry and publishes one result, so there is
       * nothing to reconcile here — just adopt it, after checking
       * it belongs to the match we are actually in. Without that
       * guard a result still in flight when the player skips would
       * paint the previous stranger's number onto the new one.
       *
       * Both events also carry the corrected round timeline, since
       * resolving the lead-in is what tells the server when the
       * countdown really starts.
       */
      socket.on(
        "face_sync_result",
        ({
          score,
          category,
          variant,
          ...schedule
        }: { score?: number; category?: string; variant?: number } & RoundSchedulePayload) => {
          const matchId = currentMatchIdRef.current;
          if (!matchId || (schedule.matchId && schedule.matchId !== matchId)) return;
          if (typeof score !== "number" || !Number.isFinite(score)) return;
          if (typeof category !== "string" || !category) return;
          applySchedule(schedule, matchId);
          setFaceSyncResult({
            matchId,
            score: Math.max(0, Math.min(100, Math.round(score))),
            category: category as FaceSyncCategory,
            variant: typeof variant === "number" && Number.isFinite(variant) ? variant : 0,
          });
        },
      );

      socket.on("face_sync_skipped", (schedule: RoundSchedulePayload) => {
        const matchId = currentMatchIdRef.current;
        if (!matchId || (schedule?.matchId && schedule.matchId !== matchId)) return;
        applySchedule(schedule ?? {}, matchId);
        setFaceSyncSkippedFor(matchId);
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
        clearStreamTimeout();
        setMatchResult((previous) =>
          previous?.matchId === result.matchId ? previous : Object.freeze({ ...result }),
        );
        setPartnerScore(result.partnerScore);
        // The result event also carries the celebrity reference so
        // the result screen can render it after `currentCelebrity`
        // has been cleared by `resetMatchState`.
        if (result.celebrity) {
          setCurrentCelebrity((previous) => {
            if (previous && previous.id === result.celebrity?.id) return previous;
            return {
              id: result.celebrity?.id ?? 0,
              name: result.celebrity?.name ?? "Celebrity",
              category: previous?.category ?? "celebrity",
              imageUrl: previous?.imageUrl ?? "",
              difficulty: previous?.difficulty ?? "medium",
              expressionProfile: previous?.expressionProfile ?? null,
            };
          });
        }
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

      // The "go" packet, fired the instant the server opens the
      // scan window. This device's 10-second timer starts on
      // arrival — not on a shared deadline — so a slow link costs a
      // later finish, never a shorter round. It also dims the
      // "change emoji" control.
      socket.on("emoji_locked", (payload: RoundSchedulePayload = {}) => {
        if (payload.matchId && payload.matchId !== currentMatchIdRef.current) return;
        setEmojiLocked(true);
        startScanWindow(payload);
      });

      // A score that missed the window is a round-level outcome, not
      // a connection failure — the server's deadline finalizer still
      // produces a result, so this must never flip the UI into its
      // fatal error state.
      socket.on("score_rejected", ({ reason }: { reason?: string }) => {
        console.warn("[Signaling] Score not counted:", reason || "unknown");
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
      answerCall(call);
    });

    peer.on("error", (err) => {
      console.error("[PeerJS]", err.type, err.message);
      if (err.type === "peer-unavailable") {
        // Media can fail while the Socket.io opponent is still connected.
        // Keep the synchronized game round alive without remote video.
        console.warn("[PeerJS] peer-unavailable — continuing without remote video");
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
      serverClockRef.current?.dispose();
      serverClockRef.current = null;
      callRef.current?.close();
      pendingCallRef.current?.close();
      pendingCallRef.current = null;
      peerRef.current?.destroy();
      peerRef.current = null;
      socketRef.current?.disconnect();
      setStatus("idle");
      resetMatchState();
    };
  }, [sessionToken, answerCall, placeCall, resetMatchState, startStreamTimeout, clearStreamTimeout, setRemoteStreamSynced, buildJoinPayload]);

  /**
   * Publish this device's facial geometry for the current match,
   * or `null` to say there is nothing to offer (no face, camera
   * off, MediaPipe unavailable).
   *
   * Reporting the null case matters as much as the real one: it is
   * what lets the server end the lead-in immediately instead of
   * holding the partner until the collection window times out.
   */
  const sendFaceSyncSample = useCallback((vector: FaceVector | null) => {
    const socket = socketRef.current;
    if (!socket || !currentMatchIdRef.current) return;
    socket.emit("face_sync_sample", vector ? { vector } : { unavailable: true });
  }, []);

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
    roundSchedule,
    partnerScore,
    partnerLiveScore,
    matchResult,
    emojiPrompt,
    currentCelebrity,
    emojiLocked,
    partnerName,
    partnerCountry,
    partnerCountryCode,
    currentMatchId,
    faceSyncResult,
    faceSyncSkippedFor,
    sendFaceSyncSample,
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
