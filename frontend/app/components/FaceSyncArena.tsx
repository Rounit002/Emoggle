"use client";

/**
 * FaceSyncArena
 * -------------
 * FaceSync as a mode in its own right: get paired with a stranger,
 * see how much you two look alike, move on. No emoji prompt, no
 * countdown, no ten-second scan window, no score submission and no
 * ELO — the resemblance IS the round.
 *
 * It rides the same matchmaking pipeline as the emoji duel but on
 * its own queue (`gameMode: "facesync"`). The server refuses to
 * pair across modes, which is the point: someone who picked this
 * card must never land in a ten-second emoji duel they did not ask
 * for. The cost of that guarantee is a split matchmaking pool.
 *
 * Deliberately NOT reusing `DuelArena`. That component carries the
 * whole round lifecycle — round clock, expression scorer, stable
 * sampler, score submission, ELO, result screen — and every one of
 * those would have to be branched off a mode flag. A separate,
 * much smaller component keeps the duel untouched.
 *
 * What it does share: the camera hook, the matchmaking hook, the
 * FaceSync hook, the video tiles, the lobby overlay and the card
 * itself (in its `hero` size).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import VideoPanel from "./VideoPanel";
import FaceSync from "./FaceSync";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useFaceSync } from "../hooks/useFaceSync";
import { useLocalCamera } from "../hooks/useLocalCamera";
import { useUserProfile } from "../context/UserProfileContext";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import { MIN_SAMPLES } from "../lib/faceSync/types";
import { MISSING_FACE_TITLE } from "../lib/faceSync/messages";
import {
  Button,
  IconButton,
  Logo,
  LobbyOverlay,
  ThemeToggle,
  ArrowLeft,
  Mic,
  MicOff,
  Refresh,
} from "../ui";

interface FaceSyncArenaProps {
  onBack: () => void;
}

export default function FaceSyncArena({ onBack }: FaceSyncArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const {
    stream: localStream,
    status: localCameraStatus,
    error: localCameraError,
    retry: retryCamera,
  } = useLocalCamera({ audio: true });
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [searchSession, setSearchSession] = useState(0);
  /** Which search we have already decided is an empty queue. */
  const [emptyQueueFor, setEmptyQueueFor] = useState<string | null>(null);

  const { profile, saveProfile, sessionToken } = useUserProfile();
  const { name: myName } = usePlayerName();
  const { country: detectedCountry } = useCountry();
  const myCountry = detectedCountry?.display ?? null;
  const myCountryCode = detectedCountry?.countryCode ?? null;

  const {
    status,
    remoteStream,
    partnerName,
    partnerCountry,
    partnerCountryCode,
    currentMatchId,
    faceSyncResult,
    faceSyncSkippedFor,
    sendFaceSyncSample,
    skipUser,
    stopMatching,
    startMatching,
  } = useMatchmaking(
    localStream,
    myName,
    myCountry,
    myCountryCode,
    profile,
    saveProfile,
    localStream ? sessionToken : null,
    "facesync",
  );

  const faceSync = useFaceSync({
    videoRef: webcamRef,
    matchId: currentMatchId,
    partnerPresent: Boolean(remoteStream),
    result: faceSyncResult,
    skippedFor: faceSyncSkippedFor,
    onSubmit: sendFaceSyncSample,
  });

  // Stable per match, so the scanning line does not flicker between
  // phrasings on every re-render.
  const variantSeed = useMemo(() => {
    if (!currentMatchId) return 0;
    let hash = 0;
    for (let i = 0; i < currentMatchId.length; i += 1) {
      hash = (hash * 31 + currentMatchId.charCodeAt(i)) >>> 0;
    }
    return hash;
  }, [currentMatchId]);

  /*
   * "Nobody around" is derived rather than reset.
   *
   * The obvious shape — clear the flag at the top of the effect,
   * set it on a timer — writes state synchronously during an
   * effect, which cascades renders. Tagging the timeout with the
   * search it belongs to means the flag is simply false for every
   * other search, with no reset to write.
   */
  const searchKey = `${status}:${searchSession}`;
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setTimeout(() => setEmptyQueueFor(searchKey), 6000);
    return () => clearTimeout(timer);
  }, [status, searchKey]);

  const noOneFound = status === "waiting" && emptyQueueFor === searchKey;

  const handleRetry = useCallback(() => {
    setSearchSession((s) => s + 1);
    startMatching();
  }, [startMatching]);

  const handleCancelSearch = useCallback(() => {
    stopMatching();
    onBack();
  }, [onBack, stopMatching]);

  const handleNextStranger = useCallback(() => {
    setSearchSession((s) => s + 1);
    skipUser();
  }, [skipUser]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const next = !isMicMuted;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setIsMicMuted(next);
  }, [localStream, isMicMuted]);

  const inMatch = status === "matched";
  /*
   * The server publishes exactly one verdict per match. Rendering
   * from `faceSyncResult` rather than from the hook's own `visible`
   * flag is deliberate: in the duel the card gets out of the way so
   * the round can start, but here the result is the destination and
   * has to stay on screen until the player asks for someone new.
   */
  const bypassed = Boolean(currentMatchId) && faceSyncSkippedFor === currentMatchId;
  const settled = Boolean(faceSyncResult) || bypassed;

  return (
    <div className="relative flex min-h-screen w-screen flex-col bg-[var(--off-white)] text-[var(--charcoal)]">
      <header className="z-30 flex flex-none items-center justify-between gap-2 border-b-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--charcoal)] transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--charcoal)]"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <span className="hidden h-5 w-px bg-[var(--ink-soft)] sm:inline-block" />
          <Logo size="sm" />
          <span className="font-display text-[11px] font-black uppercase tracking-[0.2em] text-[var(--purple-deep)]">
            <span aria-hidden>⚡ </span>FaceSync
          </span>
        </div>
        <ThemeToggle size="sm" />
      </header>

      <main
        className="flex min-h-0 flex-1 flex-col items-center gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="FaceSync arena"
      >
        {/* Faces stay visible the whole time — the entire joke is
            "do these two look alike", which does not work if the
            result covers them. Stacked on a phone, side by side on
            a desktop, with the card between. */}
        <div className="grid w-full flex-none grid-cols-1 items-start gap-6 sm:grid-cols-2 sm:gap-8">
          <FaceTile
            label="YOU"
            name={myName ?? "You"}
            country={myCountry}
            countryCode={myCountryCode}
            isLocal
            localStream={localStream}
            webcamRef={webcamRef}
            localCameraStatus={localCameraStatus}
            localCameraError={localCameraError}
            onRetryCamera={retryCamera}
            onToggleMic={toggleMic}
            isMicMuted={isMicMuted}
          />

          <div className="order-last flex w-full items-center justify-center py-1 sm:col-span-2 [&>*]:max-w-[420px]">
            <AnimatePresence mode="wait" initial={false}>
              {inMatch && faceSyncResult ? (
                <FaceSync
                  key="result"
                  variant="hero"
                  phase="showing_result"
                  result={faceSyncResult}
                  faceMissing={false}
                  sampleCount={MIN_SAMPLES}
                  sampleTarget={MIN_SAMPLES}
                  variantSeed={variantSeed}
                />
              ) : inMatch && bypassed ? (
                <MissedCard key="missed" />
              ) : inMatch ? (
                <FaceSync
                  key="scanning"
                  variant="hero"
                  phase={faceSync.phase === "idle" || faceSync.phase === "complete" || faceSync.phase === "failed"
                    ? "waiting_for_faces"
                    : faceSync.phase}
                  result={null}
                  faceMissing={faceSync.localFaceMissing}
                  sampleCount={faceSync.sampleCount}
                  sampleTarget={MIN_SAMPLES}
                  variantSeed={variantSeed}
                />
              ) : null}
            </AnimatePresence>
          </div>

          <FaceTile
            label="STRANGER"
            name={partnerName ?? "Stranger"}
            country={partnerCountry}
            countryCode={partnerCountryCode}
            isLocal={false}
            remoteStream={remoteStream}
          />
        </div>

        {/* One action, and only once there is something to move on
            from. Offering "next" mid-scan would just make people
            skip past their own result. */}
        {inMatch && settled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-none flex-wrap items-center justify-center gap-3"
          >
            <Button onClick={handleNextStranger} iconLeft={<Refresh size={16} />}>
              Next stranger
            </Button>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {(status === "idle" || status === "connecting" || (status === "waiting" && !noOneFound)) && (
          <LobbyOverlay
            status={status}
            onCancel={handleCancelSearch}
            onRetry={handleRetry}
            cameraStatus={localCameraStatus}
            cameraError={localCameraError}
            onRetryCamera={retryCamera}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === "waiting" && noOneFound && (
          <SimpleOverlay
            emoji="👀"
            title="No one around"
            body="Nobody's in the FaceSync queue right now. Try again in a moment."
            actionLabel="Try again"
            onAction={handleRetry}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === "stopped" && (
          <SimpleOverlay
            emoji="⚡"
            title="Matching paused"
            body="You stopped looking for someone. Start again when you're ready."
            actionLabel="Start matching"
            onAction={handleRetry}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ===================================================================
   One player's tile.
   =================================================================== */

interface FaceTileProps {
  label: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  isLocal: boolean;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  webcamRef?: React.RefObject<HTMLVideoElement | null>;
  localCameraStatus?: ReturnType<typeof useLocalCamera>["status"];
  localCameraError?: string | null;
  onRetryCamera?: () => void;
  onToggleMic?: () => void;
  isMicMuted?: boolean;
}

function FaceTile({
  label,
  name,
  country,
  countryCode,
  isLocal,
  localStream,
  remoteStream,
  webcamRef,
  localCameraStatus,
  localCameraError,
  onRetryCamera,
  onToggleMic,
  isMicMuted,
}: FaceTileProps) {
  return (
    <div
      className="relative mx-auto w-full max-w-[360px] min-w-0 sm:max-w-none"
    >
      <VideoPanel
        framed
        ref={webcamRef}
        label={label}
        playerName={name}
        country={country}
        countryCode={countryCode}
        // No rank in this mode: there is no score and no ELO, so
        // the pill is suppressed rather than showing a fake one.
        rankLabel=""
        isLocal={isLocal}
        localStream={localStream ?? null}
        remoteStream={remoteStream ?? null}
        autoAcquireLocalStream={false}
        frozenFrame={null}
        liveScore={null}
        score={null}
        verdict={null}
        roast={null}
        isRevealing={false}
        isPlaying={false}
        isJudging={false}
        scanBox={null}
        faceLandmarks={null}
        fullBleedOnMobile
        localCameraStatus={isLocal ? localCameraStatus : undefined}
        localCameraError={isLocal ? localCameraError : undefined}
        onRetryCamera={isLocal ? onRetryCamera : undefined}
      />

      {isLocal && onToggleMic && (
        <div className="absolute bottom-14 right-3 z-40">
          <IconButton
            size="sm"
            variant={isMicMuted ? "default" : "purple"}
            label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
            onClick={onToggleMic}
          >
            {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </IconButton>
        </div>
      )}
    </div>
  );
}

/* ===================================================================
   "We couldn't compare you" — the graceful miss.
   =================================================================== */

function MissedCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="flex w-full max-w-[420px] flex-col items-center gap-2 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-6 py-6 text-center shadow-[8px_8px_0_0_var(--charcoal)]"
      role="status"
      aria-live="polite"
    >
      <span className="font-display text-[11px] font-black uppercase tracking-[0.2em] text-[var(--purple-deep)] sm:text-xs">
        <span aria-hidden>⚡ </span>FaceSync
      </span>
      <span className="font-display text-xl font-bold text-[var(--charcoal)] sm:text-2xl">
        {MISSING_FACE_TITLE}
      </span>
      <p className="text-sm leading-snug text-[var(--on-surface-variant)]">
        Couldn&apos;t get a clear look at both of you this time. Try the next
        stranger.
      </p>
    </motion.div>
  );
}

/* ===================================================================
   Shared sticker-card overlay for the empty / paused states.
   =================================================================== */

function SimpleOverlay({
  emoji,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      style={{
        backgroundColor: "var(--off-white)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border-[4px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 text-center shadow-[8px_8px_0_0_var(--charcoal)] tilt-l-1 sm:p-8">
        <span className="font-display text-5xl" aria-hidden>{emoji}</span>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--charcoal)] sm:text-3xl">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--on-surface-variant)]">{body}</p>
        <div className="mt-2 flex justify-center">
          <Button onClick={onAction} iconLeft={<Refresh size={16} />}>{actionLabel}</Button>
        </div>
      </div>
    </motion.div>
  );
}
