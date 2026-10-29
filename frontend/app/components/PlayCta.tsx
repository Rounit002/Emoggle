import Link from "next/link";

/** Call to action that closes each topic guide: sends the reader to play. */
export default function PlayCta({
  heading = "Try it now",
  text = "Emoggle is free and runs in your browser. Allow the camera, copy the emoji, and get your score in seconds.",
}: {
  heading?: string;
  text?: string;
}) {
  return (
    <section className="rounded-3xl border-[3px] border-[var(--charcoal)] bg-[var(--off-white-2)] p-6 shadow-[6px_6px_0_0_var(--charcoal)] sm:p-8">
      <h2 className="mt-0">{heading}</h2>
      <p>{text}</p>
      <Link
        href="/"
        className="on-accent mt-5 inline-flex h-12 items-center rounded-full border-[3px] border-[var(--ink-shadow)] bg-[var(--yellow)] px-6 text-sm font-bold text-[var(--ink)] no-underline shadow-[4px_4px_0_0_var(--ink-shadow)] transition-transform active:translate-y-1 active:shadow-none"
        // .info-content styles every link as underlined body text; a button
        // has to opt out.
        style={{ textDecoration: "none", color: "var(--ink)" }}
      >
        Play Emoggle free
      </Link>
    </section>
  );
}
