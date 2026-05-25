"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Peer, { MediaConnection } from "peerjs";

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";

export type MatchStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "matched"
  | "error";

export interface ChatMessage {
  text: string;
  fromSelf: boolean;
  ts: number;
}

export interface MatchmakingState {
  status: MatchStatus;
  remoteStream: MediaStream | null;
  localPeerId: string | null;
  partnerPeerId: string | null;
  countdown: number | null;
  partnerScore: number | null;
  partnerLiveScore: number | null;
  emojiPrompt: string | null;
  submitScore: (score: number) => void;
  submitLiveScore: (score: number) => void;
  skipUser: () => void;
  messages: ChatMessage[];
  sendChat: (text: string) => void;
}

export function useMatchmaking(
  localStream: MediaStream | null
): MatchmakingState {
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);

  const [status, setStatus] = useState<MatchStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [partnerPeerId, setPartnerPeerId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [partnerScore, setPartnerScore] = useState<number | null>(null);
  const [partnerLiveScore, setPartnerLiveScore] = useState<number | null>(null);
  const [emojiPrompt, setEmojiPrompt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const resetMatchState = useCallback(() => {
    callRef.current?.close();
    callRef.current = null;
    setRemoteStream(null);
    setPartnerPeerId(null);
    setCountdown(null);
    setPartnerScore(null);
    setPartnerLiveScore(null);
    setEmojiPrompt(null);
    setMessages([]);
  }, []);

  /* ── Helper: answer an incoming call ── */
  const answerCall = useCallback(
    (call: MediaConnection, stream: MediaStream) => {
      callRef.current = call;
      call.answer(stream);
      call.on("stream", (remote) => setRemoteStream(remote));
      call.on("close", () => setRemoteStream(null));
    },
    []
  );

  /* ── Helper: place an outgoing call ── */
  const placeCall = useCallback(
    (peer: Peer, targetPeerId: string, stream: MediaStream) => {
      const call = peer.call(targetPeerId, stream);
      callRef.current = call;
      call.on("stream", (remote) => setRemoteStream(remote));
      call.on("close", () => setRemoteStream(null));
    },
    []
  );

  useEffect(() => {
    if (!localStream) return;

    setStatus("connecting");

    /* ── 1. Create PeerJS instance ── */
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setLocalPeerId(id);

      /* ── 2. Connect to signaling server ── */
      const socket = io(SIGNALING_URL, { transports: ["websocket"] });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("join_queue", { peerId: id });
        setStatus("waiting");
      });

      socket.on("waiting", () => setStatus("waiting"));

      socket.on(
        "match_found",
        ({ partnerPeerId: ppId, role, emoji }: { partnerPeerId: string; role: string; emoji?: string }) => {
          callRef.current?.close();
          callRef.current = null;
          setRemoteStream(null);
          setPartnerPeerId(ppId);
          setEmojiPrompt(emoji ?? "\u{1F600}");
          setCountdown(null);
          setPartnerScore(null);
          setPartnerLiveScore(null);
          setMessages([]);
          setStatus("matched");

          if (role === "caller") {
            placeCall(peer, ppId, localStream);
          }
          /* receiver waits for the incoming call below */
        }
      );

      /* ── 3. Handle countdown sync from server ── */
      socket.on("countdown_tick", ({ count }: { count: number }) => {
        setCountdown(count);
      });

      socket.on("scores_ready", ({ partnerScore: ps }: { myScore: number; partnerScore: number }) => {
        setPartnerScore(ps);
      });

      socket.on("partner_live_score", ({ score }: { score: number }) => {
        setPartnerLiveScore(score);
      });

      socket.on("match_skipped", () => {
        resetMatchState();
        setStatus("waiting");
      });

      socket.on("chat_message", ({ text }: { text: string; fromSelf: boolean }) => {
        setMessages((prev) => [...prev, { text, fromSelf: false, ts: Date.now() }]);
      });

      socket.on("disconnect", () => {
        setStatus("idle");
        setRemoteStream(null);
      });
    });

    /* ── 4. Answer incoming calls (receiver role) ── */
    peer.on("call", (call) => {
      answerCall(call, localStream);
    });

    peer.on("error", (err) => {
      console.error("[PeerJS]", err);
      setStatus("error");
    });

    return () => {
      callRef.current?.close();
      peerRef.current?.destroy();
      socketRef.current?.disconnect();
      setStatus("idle");
      resetMatchState();
    };
  }, [localStream, answerCall, placeCall, resetMatchState]);

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

  const sendChat = useCallback((text: string) => {
    if (!text.trim()) return;
    socketRef.current?.emit("chat_message", { text });
    setMessages((prev) => [...prev, { text, fromSelf: true, ts: Date.now() }]);
  }, []);

  return {
    status,
    remoteStream,
    localPeerId,
    partnerPeerId,
    countdown,
    partnerScore,
    partnerLiveScore,
    emojiPrompt,
    submitScore,
    submitLiveScore,
    skipUser,
    messages,
    sendChat,
  };
}
