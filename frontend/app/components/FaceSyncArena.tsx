"use client";

/**
 * FaceSyncArena
 * -------------
 * FaceSync as a mode in its own right: get paired with a stranger,
 * see how much you two look alike, move on. No emoji prompt, no
 * countdown, no ten-second scan window, no score submission and no
 * ELO — the resemblance IS the round.
 *
 * It rides the shared stranger queue. When the other player chose
 * another mode, the server switches their arena before the match
 * starts so both clients follow FaceSync's round rules.
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

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import VideoPanel from "./VideoPanel";
import FaceSync from "./FaceSync";
import ChatBox from "./ChatBox";
import { SeriesPanel } from "./SeriesPanel";
import { useMatchmaking, type MatchGameMode } from "../hooks/useMatchmaking";
import { useFaceSync } from "../hooks/useFaceSync";
import { useLocalCamera } from "../hooks/useLocalCamera";
import { useUserProfile } from "../context/UserProfileContext";
import { usePlayerName } from "../context/PlayerNameContext";
import { useCountry } from "../context/CountryContext";
import { MIN_SAMPLES } from "../lib/faceSync/types";
import { MISSING_FACE_TITLE } from "../lib/faceSync/messages";
import { flagFromAnyOrFallback } from "../lib/country";
import GameOptionsMenu from "./GameOptionsMenu";
import type { GameMode } from "./ChooseGameMode";
import {
  Button,
  IconButton,
  Logo,
  LobbyOverlay,
  ArrowLeft,
  Mic,
  MicOff,
  Refresh,
} from "../ui";

interface FaceSyncArenaProps {
  privateSeriesId?: string;
  privateRoomCode?: string | null;
  onBack: () => void;
  modeSwitchTicket?: string | null;
  onModeSwitch?: (mode: MatchGameMode, ticket: string) => void;
  /** Leave for another game mode from the options menu (public play only). */
  onSelectMode?: (mode: GameMode) => void;
}

export default function FaceSyncArena({ onBack, modeSwitchTicket, onModeSwitch, onSelectMode, privateSeriesId, privateRoomCode }: FaceSyncArenaProps) {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const {
    stream: localStream,
    status: localCameraStatus,
    error: localCameraError,
    retry: retryCamera,
  } = useLocalCamera({ audio: true });
  const [isMicMuted, setIsMicMuted] = useState(false);

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
    messages,
    sendChat,
    rivalTyping,
    sendTyping,
    reportPartner,
    faceSyncResult,
    faceSyncSkippedFor,
    sendFaceSyncSample,
    skipUser,
    stopMatching,
    startMatching,
    seriesState,
    readyPrivate,
    roundSchedule,
    roundError,
    retryRound,
  } = useMatchmaking(
    localStream,
    myName,
    myCountry,
    myCountryCode,
    profile,
    saveProfile,
    // Matchmaking is independent of camera permission; the hook waits to
    // start the media call until a local stream exists.
    sessionToken,
    "facesync",
    modeSwitchTicket,
    onModeSwitch,
    privateSeriesId,
  );

  const faceSync = useFaceSync({
    videoRef: webcamRef,
    matchId: privateSeriesId && roundSchedule?.serverPhase === "preparing" ? null : currentMatchId,
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

  const handleRetry = useCallback(() => {
    startMatching();
  }, [startMatching]);

  const handleCancelSearch = useCallback(() => {
    stopMatching();
    onBack();
  }, [onBack, stopMatching]);

  const handleStopSearch = useCallback(() => {
    stopMatching();
  }, [stopMatching]);

  const handleNextStranger = useCallback(() => {
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

  const optionsMenu = (triggerClassName: string) => (
    <GameOptionsMenu
      currentMode="facesync"
      partnerLabel={partnerName ?? (privateSeriesId ? "Friend" : "Stranger")}
      onFindNew={privateSeriesId ? undefined : handleNextStranger}
      onSelectMode={privateSeriesId ? undefined : onSelectMode}
      onReport={inMatch ? reportPartner : undefined}
      onLeave={handleCancelSearch}
      leaveLabel={privateSeriesId ? "Leave 1v1" : "Leave FaceSync"}
      triggerClassName={triggerClassName}
    />
  );
  const settled = Boolean(faceSyncResult) || bypassed;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--off-white)] text-[var(--charcoal)] sm:h-auto sm:min-h-screen sm:overflow-visible">
      <header className="z-30 flex flex-none items-center justify-between gap-2 border-b-[3px] border-[var(--charcoal)] bg-[var(--off-white)] px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={handleCancelSearch}
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
        {/* Desktop home of the options menu; phones get it in the
            chat bar beside Skip. */}
        {optionsMenu("hidden sm:inline-flex")}
      </header>

      <main
        className="flex min-h-0 flex-1 flex-col items-center gap-2 p-3 pb-2 sm:gap-4 sm:p-4 lg:gap-6 lg:p-6"
        aria-label="FaceSync arena"
      >
        {privateSeriesId && <SeriesPanel series={seriesState} ready={readyPrivate} leave={handleCancelSearch} roomCode={privateRoomCode}/>}
        {privateSeriesId && roundError && <p role="alert">{roundError} <button className="min-h-11 underline" onClick={retryRound}>Retry connection</button></p>}
        {/* Faces stay visible the whole time — the entire joke is
            "do these two look alike", which does not work if the
            result covers them. Phone: camera / card+action row /
            camera sharing the viewport height, like the duel, so the
            whole session (and the chat dock) fits one screen.
            Desktop: side by side with the card below. */}
        <div className="grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:flex-none sm:grid-cols-2 sm:grid-rows-none sm:items-start sm:gap-8">
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

          <div className="flex w-full items-center justify-center gap-2 px-2.5 sm:order-last sm:col-span-2 sm:px-0 sm:py-1">
            <div className="flex min-w-0 flex-1 justify-center sm:flex-none sm:w-full [&>*]:max-w-[420px]">
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
                  compactOnMobile
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
                  compactOnMobile
                />
              ) : null}
            </AnimatePresence>
            </div>
          </div>

          <FaceTile
            label={privateSeriesId ? "FRIEND" : "STRANGER"}
            name={partnerName ?? (privateSeriesId ? "Friend" : "Stranger")}
            country={partnerCountry}
            countryCode={partnerCountryCode}
            isLocal={false}
            remoteStream={remoteStream}
          />
        </div>

        {/* The chat belongs to the active FaceSync session and spans the
            complete camera area, matching the two-up layout above it. */}
        {inMatch && (
          <div className="h-[64px] w-full flex-none sm:h-[300px]">
            <ChatBox
              messages={messages}
              onSend={sendChat}
              onTyping={sendTyping}
              rivalTyping={rivalTyping}
              partnerLabel={partnerName ?? "Stranger"}
              matchId={currentMatchId}
              onReport={reportPartner}
              compactOnMobile
              mobileAction={<>{privateSeriesId ? null : (
                <button
                  type="button"
                  onClick={handleNextStranger}
                  aria-label="Skip this player"
                  className="h-full min-h-11 flex-none rounded-xl border-[2px] border-[var(--charcoal)] bg-[var(--yellow)] px-5 text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--ink)] shadow-[2px_2px_0_0_var(--charcoal)] transition-transform active:translate-y-[2px] active:shadow-none"
                >
                  Skip
                </button>
              )}{optionsMenu("h-full")}</>}
            />
          </div>
        )}

        {/* One action, and only once there is something to move on
            from. Offering "next" mid-scan would just make people
            skip past their own result. */}
        {!privateSeriesId && inMatch && settled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="hidden flex-none flex-wrap items-center justify-center gap-3 sm:flex"
          >
            <Button onClick={handleNextStranger} iconLeft={<Refresh size={16} />}>
              Next stranger
            </Button>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {!privateSeriesId && (status === "idle" || status === "connecting" || status === "waiting" || status === "stopped" || status === "error") && (
          <LobbyOverlay
            status={status}
            onCancel={handleCancelSearch}
            onStop={handleStopSearch}
            onRetry={handleRetry}
            cameraStatus={localCameraStatus}
            cameraError={localCameraError}
            onRetryCamera={retryCamera}
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
  const flag = flagFromAnyOrFallback(country, countryCode);
  return (
    <div
      className="relative h-full min-h-0 w-full min-w-0 px-2.5 sm:h-auto sm:px-0"
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
        minimalOnMobile
        localCameraStatus={isLocal ? localCameraStatus : undefined}
        localCameraError={isLocal ? localCameraError : undefined}
        onRetryCamera={isLocal ? onRetryCamera : undefined}
      />

      {/* Mobile identity chip; desktop keeps the framed labels. Chip and
          mic offsets include the tile's px-2.5 gutter. */}
      <div className="absolute bottom-2.5 left-5 z-40 flex max-w-[calc(100%-6.5rem)] items-center gap-1.5 rounded-full border border-white/20 bg-black/65 py-1 pl-2 pr-2.5 text-white backdrop-blur-md sm:hidden">
        <span aria-hidden className="text-sm leading-none">{flag}</span>
        <span className="truncate text-xs font-bold">{name}</span>
        <span
          className="flex-none rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-white"
          style={{ background: isLocal ? "#1976d2" : "var(--pink-deep)" }}
        >
          {isLocal ? "You" : label}
        </span>
      </div>

      {isLocal && onToggleMic && (
        <div className="absolute bottom-2.5 right-5 z-40 sm:bottom-14 sm:right-3">
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
      className="flex w-full max-w-[420px] flex-col items-center gap-1 rounded-2xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] px-3 py-2 text-center shadow-[4px_4px_0_0_var(--charcoal)] sm:gap-2 sm:rounded-3xl sm:border-[4px] sm:px-6 sm:py-6 sm:shadow-[8px_8px_0_0_var(--charcoal)]"
      role="status"
      aria-live="polite"
    >
      <span className="font-display text-[9px] font-black uppercase tracking-[0.2em] text-[var(--purple-deep)] sm:text-xs">
        <span aria-hidden>⚡ </span>FaceSync
      </span>
      <span className="font-display text-base font-bold text-[var(--charcoal)] sm:text-2xl">
        {MISSING_FACE_TITLE}
      </span>
      <p className="text-xs leading-snug text-[var(--on-surface-variant)] sm:text-sm">
        Couldn&apos;t get a clear look at both of you this time. Try the next
        stranger.
      </p>
    </motion.div>
  );
}
