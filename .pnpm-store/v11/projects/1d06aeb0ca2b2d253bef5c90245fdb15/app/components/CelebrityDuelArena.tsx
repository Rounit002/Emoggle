"use client";

// Placeholder — celebrity mode is a paid feature, not in this redesign pass.
interface CelebrityDuelArenaProps {
  onBack: () => void;
}

export default function CelebrityDuelArena({ onBack }: CelebrityDuelArenaProps) {
  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center gap-4 bg-[var(--off-white)] p-6 text-[var(--charcoal)]">
      <h1 className="font-display text-3xl font-bold">Celebrity mode</h1>
      <p className="text-sm text-[var(--on-surface-variant)]">Coming soon.</p>
      <button
        onClick={onBack}
        className="rounded-full border-[3px] border-[var(--charcoal)] bg-[var(--yellow)] px-5 py-2 text-sm font-bold shadow-[4px_4px_0_0_var(--charcoal)] active:translate-y-1 active:shadow-none"
      >
        Back
      </button>
    </div>
  );
}
