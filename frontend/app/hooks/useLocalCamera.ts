"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LocalCameraStatus = "requesting" | "ready" | "error";

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow camera access in your browser, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found. Connect a camera, then try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your camera is busy in another app. Close it there, then try again.";
  }
  return "The camera could not start. Check your browser permissions and try again.";
}

/** Own one local camera stream and expose a user-recoverable retry state. */
export function useLocalCamera({ audio = false }: { audio?: boolean } = {}) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LocalCameraStatus>("requesting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    let acquired: MediaStream | null = null;

    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setError("Camera access is not supported in this browser.");
          setStatus("error");
        }
        return;
      }

      const video = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      } as const;

      try {
        try {
          acquired = await navigator.mediaDevices.getUserMedia({ video, audio });
        } catch (firstError) {
          if (!audio) throw firstError;
          acquired = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        }

        if (cancelled) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = acquired;
        setStream(acquired);
        setError(null);
        setStatus("ready");
      } catch (nextError) {
        if (cancelled) return;
        setError(cameraErrorMessage(nextError));
        setStatus("error");
      }
    };

    void open();
    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === acquired) streamRef.current = null;
    };
  }, [attempt, audio]);

  const retry = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setError(null);
    setStatus("requesting");
    setAttempt((value) => value + 1);
  }, []);

  return { stream, status, error, retry };
}
