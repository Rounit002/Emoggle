import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game History",
  description: "Review your Emoggle solo scans and live duel scores saved on this device.",
  // Scores live in this browser only, so crawlers see an empty page.
  robots: { index: false, follow: true },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
