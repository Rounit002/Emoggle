import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game History",
  description: "Review your Emoggle solo scans and live duel scores saved on this device.",
  alternates: { canonical: "/history" },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
