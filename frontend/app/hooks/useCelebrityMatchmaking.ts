"use client";

/**
 * useCelebrityMatchmaking
 * -----------------------
 * Celebrity Face Mimic matchmaking. Lives in its own hook so the
 * existing emoji-duel flow in `useMatchmaking.ts` stays untouched.
 * Both hooks consume the same socket.io + PeerJS plumbing, so the
 * underlying transport is identical — only the queue, the events,
 * and the result payload are mode-specific.
 *
 * What this hook owns
 *  - Connection / reconnect: same as the emoji hook, runs while
 *    `localStream` is non-null.
 *  - Queueing: shares the canonical stranger queue (`join_queue`,
 *    `waiting`, and `match_started`) with the emoji duel. The server
 *    includes one synchronized celebrity target in that match payload.
 *  - Round lifecycle: the same 3-second countdown + 10-second scan
 *    window the emoji duel uses. The server owns the timing and
 *    fans `countdown_tick` + `emoji_locked` events out.
 *  - Scoring: the round uses a peak-score model (the player's best
 *    sample across the 10s window is the final score). The local
 *    computation happens in `useCelebrityExpressionScorer`; this
 *    hook just forwards the final number via `submitScore`.
 *  - Result: the canonical `match_result` event carries the same
 *    player-relative outcome payload as the emoji mode plus a
 *    `{ id, name }` celebrity reference, so the result screen can
 *    show "you were imitating Morgan Freeman".
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Peer, { MediaConnection } from "peerjs";
import { UserProfile } from "../context/UserProfileContext";
import type { ExpressionProfile } from "../lib/celebrityScoring";

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

export type CelebrityMatchStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "matched"
  | "stopped"
  | "error";

export interface CelebrityChatMessage {
  text: string;
  fromSelf: boolean;
  ts: number;
}

/** The celebrity target the server picked for the current match. */
export interface CelebrityTarget {
  id: number;
  name: string;
  category: string;
  imageUrl: string;
  difficulty: string;
  /** Optional hand-curated target expression profile in [0,1]. */
  expressionProfile?: ExpressionProfile | null;
}

/** Player-relative match result — same shape as the emoji mode's
 *  `MatchResult`, plus a `celebrity` reference for the result screen. */
export interface CelebrityMatchResult {
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
  celebrity: { id: number | null; name: string | null } | null;
}

export interface CelebrityMatchmakingState {
  status: CelebrityMatchStatus;
  remoteStream: MediaStream | null;
  localPeerId: string | null;
  partnerPeerId: string | null;
  countdown: number | null;
  partnerScore: number | null;
  partnerLiveScore: number | null;
  matchResult: CelebrityMatchResult | null;
  target: CelebrityTarget | null;
  emojiLocked: boolean;
  partnerName: string | null;
  partnerCountry: string | null;
  partnerCountryCode: string | null;
  currentMatchId: string | null;
  /** Submit the player's final (peak) score to the server. */
  submitScore: (score: number) => void;
  submitLiveScore: (score: number) => void;
  /** Skip the current match / partner and re-queue. */
  skipUser: () => void;
  stopMatching: () => void;
  startMatching: () => void;
  messages: CelebrityChatMessage[];
  sendChat: (text: string) => void;
  rivalTyping: boolean;
  sendTyping: (isTyping: boolean) => void;
}

export function useCelebrityMatchmaking(
  localStream: MediaStream | null,
  myName: string | null = null,
  myCountry: string | null = null,
  myCountryCode: string | null = null,
  profile: UserProfile | null = null,
  onProfileUpdate?: (profile: UserProfile) => void,
  sessionToken?: string | null,
): CelebrityMatchmakingState {
  const profileRef = useRef<UserProfile | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const currentMatchIdRef = useRef<string | null>(null);

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

  const [status, setStatus] = useState<CelebrityMatchStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [partnerPeerId, setPartnerPeerId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);
  const [partnerLiveScore, setPartnerLiveScore] = useState<number | null>(null);
  const [matchResult, setMatchResult] = useState<CelebrityMatchResult | null>(null);
  const [target, setTarget] = useState<CelebrityTarget | null>(null);
  const [emojiLocked, setEmojiLocked] = useState(false);
  const [messages, setMessages] = useState<CelebrityChatMessage[]>([]);
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
    setTarget(null);
    setEmojiLocked(false);
    setMessages([]);
    setRivalTyping(false);
    setPartnerName(null);
    setPartnerCountry(null);
    setPartnerCountryCode(null);
    currentMatchIdRef.current = null;
    setCurrentMatchId(null);
  }, [clearStreamTimeout, setRemoteStreamSynced]);

  const startStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      if (!remoteStreamRef.current) {
        console.warn(
          "[PeerJS] Celebrity stream timeout — keeping the active match connected",
        );
      }
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout]);

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

    const peer = new Peer({ config: { iceServers: buildIceServers() } });
    peerRef.current = peer;

    peer.on("open", (id) => {
      setStatus("connecting");
      setLocalPeerId(id);

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
        console.error("[Signaling] Celebrity connection failed:", error.message);
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

      socket.on("user_id", ({ userId }: { userId?: string }) => {
        if (!userId) return;
        const current = profileRef.current;
        if (!current) return;
        if (typeof current.userId === "string" && current.userId.length > 0) return;
        const nextProfile = { ...current, userId };
        profileRef.current = nextProfile;
        onProfileUpdateRef.current?.(nextProfile);
      });

      const handleMatchStarted = (payload: {
        matchId?: string;
        partnerPeerId: string;
        role: string;
        partnerCountry?: string | null;
        partnerCountryCode?: string | null;
        partnerName?: string | null;
        duration: number;
        celebrity: CelebrityTarget;
      }) => {
        stoppedRef.current = false;
        callRef.current?.close();
        callRef.current = null;
        setRemoteStreamSynced(null);
        setPartnerPeerId(payload.partnerPeerId);
        setTarget(payload.celebrity ?? null);
        setEmojiLocked(false);
        setCountdown(null);
        setPartnerScore(null);
        setPartnerLiveScore(null);
        setMatchResult(null);
        setMessages([]);
        setPartnerName(
          typeof payload.partnerName === "string" && payload.partnerName
            ? payload.partnerName
            : null
        );
        setPartnerCountry(payload.partnerCountry ?? null);
        setPartnerCountryCode(
          typeof payload.partnerCountryCode === "string" && payload.partnerCountryCode
            ? payload.partnerCountryCode.toUpperCase()
            : null
        );
        const nextMatchId =
          typeof payload.matchId === "string" && payload.matchId ? payload.matchId : null;
        currentMatchIdRef.current = nextMatchId;
        setCurrentMatchId(nextMatchId);
        setStatus("matched");
        startStreamTimeout();

        if (payload.role === "caller") {
          placeCall(peer, payload.partnerPeerId, localStream);
        }
      };

      socket.on("match_started", handleMatchStarted);

      socket.on("countdown_tick", ({ count }: { count: number }) => {
        setCountdown(count);
      });

      socket.on("scores_ready", ({ partnerScore: ps }: { myScore: number; partnerScore: number }) => {
        setPartnerScore(ps);
      });

      socket.on("partner_score", ({ score }: { score: number }) => {
        setPartnerScore(score);
      });

      socket.on("match_result", (result: CelebrityMatchResult) => {
        if (!result || result.matchId !== currentMatchIdRef.current) return;
        if (!Number.isFinite(result.myScore) || !Number.isFinite(result.partnerScore)) return;
        clearStreamTimeout();
        setMatchResult((previous) =>
          previous?.matchId === result.matchId ? previous : Object.freeze({ ...result })
        );
        setPartnerScore(result.partnerScore);
      });

      socket.on("partner_live_score", ({ score }: { score: number }) => {
        setPartnerLiveScore(score);
      });

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

      socket.on("disconnect", () => {
        setStatus("idle");
        setRemoteStreamSynced(null);
      });
    });

    peer.on("call", (call) => {
      answerCall(call, localStream);
    });

    peer.on("error", (err) => {
      console.error("[PeerJS] Celebrity", err.type, err.message);
      if (err.type === "peer-unavailable") {
        console.warn(
          "[PeerJS] Celebrity peer-unavailable — continuing without remote video",
        );
      } else if (
        err.type === "network" ||
        err.type === "socket-error" ||
        err.type === "socket-closed" ||
        err.type === "disconnected"
      ) {
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
  }, [localStream, sessionToken, answerCall, placeCall, resetMatchState, startStreamTimeout, clearStreamTimeout, setRemoteStreamSynced, buildJoinPayload]);

  const submitScore = useCallback((score: number) => {
    socketRef.current?.emit("submit_score", { score });
  }, []);

  const submitLiveScore = useCallback((score: number) => {
    socketRef.current?.emit("live_score", { score });
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

  return {
    status,
    remoteStream,
    localPeerId,
    partnerPeerId,
    countdown,
    partnerScore,
    partnerLiveScore,
    matchResult,
    target,
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
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
  };
}
