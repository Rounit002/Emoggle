"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { UserGender, UserProfile } from "../context/UserProfileContext";

interface OnboardingModalProps {
  onSubmit: (profile: UserProfile) => void;
}

type FaceApiModule = typeof import("face-api.js");
type Step = "profile" | "scan";

const MODEL_URL = "/models";
const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL ?? "http://localhost:3001";
const genders: UserGender[] = ["Male", "Female"];
const DISABLE_GENDER_VERIFICATION = true;

function calculateAge(dateOfBirth: string) {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function normalizePredictedGender(value: string | undefined): UserGender | null {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  return null;
}

export default function OnboardingModal({ onSubmit }: OnboardingModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const apiRef = useRef<FaceApiModule | null>(null);

  const [step, setStep] = useState<Step>("profile");
  const [username, setUsername] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<UserGender>("Male");
  const [modelsReady, setModelsReady] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("Camera warming up...");
  const [prediction, setPrediction] = useState<{ gender: UserGender | null; probability: number } | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stopCamera = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (step !== "scan") return;
    let cancelled = false;

    async function startScanner() {
      try {
        setScannerStatus("Loading face models...");
        const faceapi = await import("face-api.js");
        apiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
        ]);
        if (cancelled) return;
        setModelsReady(true);
        setScannerStatus("Starting camera...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScannerStatus("Looking for your face...");
      } catch {
        if (!cancelled) {
          setScannerStatus("Camera or model loading failed.");
          setError("Could not start face verification. Check camera permission and refresh.");
        }
      }
    }

    startScanner();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step]);

  useEffect(() => {
    if (step !== "scan" || !modelsReady) return;

    const tick = async () => {
      const video = videoRef.current;
      const faceapi = apiRef.current;
      if (video && faceapi && video.readyState >= 2) {
        const result = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withAgeAndGender();

        if (result) {
          const predictedGender = normalizePredictedGender(result.gender);
          setPrediction({ gender: predictedGender, probability: result.genderProbability });
          setScannerStatus(
            predictedGender
              ? `${predictedGender} signal ${(result.genderProbability * 100).toFixed(0)}%`
              : "Face found, checking geometry..."
          );
        } else {
          setPrediction(null);
          setScannerStatus("No face detected. Center your face in the frame.");
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [modelsReady, step]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();
    const age = calculateAge(dateOfBirth);
    if (trimmed.length < 2) {
      setError("Pick a username with at least 2 characters.");
      return;
    }
    if (age === null) {
      setError("Enter a valid date of birth.");
      return;
    }

    if (DISABLE_GENDER_VERIFICATION) {
      if (age < 18) {
        setError("Access Denied: You must be 18 or older to use Emoggle.");
        return;
      }

      setError("");
      setIsSubmitting(true);

      const baseProfile: UserProfile = {
        username: trimmed.slice(0, 24),
        gender,
        dateOfBirth,
        age,
        verifiedGender: gender,
        isVerified: true,
        isVIP: false,
        freeGenderMatchesLeft: 0,
      };

      try {
        const res = await fetch(`${SIGNALING_URL}/api/users/onboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: baseProfile.username,
            age: baseProfile.age,
            verified_gender: baseProfile.verifiedGender,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.id === "string") {
            baseProfile.userId = data.id;
          }
        }
      } catch {
      } finally {
        setIsSubmitting(false);
      }

      onSubmit(baseProfile);
      return;
    }

    setError("");
    setStep("scan");
  };

  const handleVerify = async () => {
    const age = calculateAge(dateOfBirth);
    if (age === null || age < 18) {
      setError("Access Denied: You must be 18 or older to use Emoggle.");
      return;
    }

    const video = videoRef.current;
    const faceapi = apiRef.current;
    if (!video || !faceapi || video.readyState < 2) {
      setError("Verification Failed: Camera is not ready yet.");
      return;
    }

    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
      .withAgeAndGender();
    const predictedGender = normalizePredictedGender(result?.gender);
    const probability = result?.genderProbability ?? 0;

    if (predictedGender === gender && probability > 0.75) {
      stopCamera();
      setIsSubmitting(true);

      const baseProfile: UserProfile = {
        username: username.trim().slice(0, 24),
        gender,
        dateOfBirth,
        age,
        verifiedGender: predictedGender,
        isVerified: true,
        isVIP: false,
        freeGenderMatchesLeft: 0,
      };

      // Register with backend to get a persistent UUID for socket sync
      try {
        const res = await fetch(`${SIGNALING_URL}/api/users/onboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: baseProfile.username,
            age: baseProfile.age,
            verified_gender: baseProfile.verifiedGender,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.id === "string") {
            baseProfile.userId = data.id;
          }
        }
      } catch {
        // Backend unavailable — profile works offline without userId
      } finally {
        setIsSubmitting(false);
      }

      onSubmit(baseProfile);
      return;
    }

    setError("Verification Failed: Face geometry does not match selected gender. Please try again in better lighting.");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 px-4 text-white backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-300/25 bg-zinc-950 p-5 shadow-[0_0_70px_rgba(34,211,238,0.18)] sm:p-6"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-300">
              {step === "profile" ? "Step 1 / Profile" : "Step 2 / Face Verification"}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
              {step === "profile" ? "Enter Emoggle" : "Verify Your Face"}
            </h2>
            <p className="mt-1 text-sm font-medium text-zinc-400">
              {step === "profile"
                ? "Your profile is stored locally on this browser."
                : "Center your face and use bright, even lighting."}
            </p>
          </div>

          {step === "profile" ? (
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Username</span>
                <input
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setError("");
                  }}
                  maxLength={24}
                  autoFocus
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-black/60 px-4 py-3 text-base font-bold text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300"
                  placeholder="Your arena name"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Date of Birth</span>
                <input
                  value={dateOfBirth}
                  onChange={(event) => {
                    setDateOfBirth(event.target.value);
                    setError("");
                  }}
                  type="date"
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-black/60 px-4 py-3 text-base font-bold text-white outline-none transition-colors focus:border-cyan-300"
                />
              </label>

              <ChoiceGroup label="Declared Gender" options={genders} value={gender} onChange={(value) => setGender(value as UserGender)} />

              <ErrorBanner error={error} />

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_0_28px_rgba(34,211,238,0.35)] transition-colors hover:bg-cyan-300"
              >
                Next
              </motion.button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-emerald-300/30 bg-black shadow-[0_0_35px_rgba(57,255,20,0.12)]">
                <video ref={videoRef} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
                <div className="pointer-events-none absolute inset-4 rounded-2xl border border-emerald-300/45 shadow-[0_0_24px_rgba(57,255,20,0.28)]" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(57,255,20,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.12)_1px,transparent_1px)] bg-[length:28px_28px] opacity-25" />
                <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 backdrop-blur-md">
                  {scannerStatus}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-black uppercase tracking-[0.12em]">
                <div className="rounded-xl border border-zinc-800 bg-black/45 px-3 py-2 text-zinc-300">
                  Declared <span className="block text-base text-white">{gender}</span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/45 px-3 py-2 text-zinc-300">
                  AI Signal <span className="block text-base text-cyan-300">{prediction?.gender ?? "--"} {prediction ? `${(prediction.probability * 100).toFixed(0)}%` : ""}</span>
                </div>
              </div>

              <ErrorBanner error={error} />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setStep("profile");
                    setError("");
                    setModelsReady(false);
                  }}
                  className="w-28 rounded-xl border border-zinc-700 bg-black/45 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-500"
                >
                  Back
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleVerify}
                  disabled={!modelsReady || isSubmitting}
                  className="flex-1 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_0_28px_rgba(57,255,20,0.28)] transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  Verify Face
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-red-400 bg-red-950 px-3 py-2 text-sm font-black text-red-100 shadow-[0_0_20px_rgba(248,113,113,0.2)]">
      {error}
    </p>
  );
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-xl border px-2 py-3 text-xs font-black uppercase tracking-[0.08em] transition-colors ${
                selected
                  ? "border-cyan-300 bg-cyan-300 text-black shadow-[0_0_20px_rgba(34,211,238,0.28)]"
                  : "border-zinc-700 bg-black/45 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
