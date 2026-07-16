import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-600">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-gray-700">
            <span className="font-semibold">Emoggle</span>
            <span className="hidden sm:inline">·</span>
            <span className="text-gray-500">Two strangers. One emoji.</span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/refund" className="hover:text-gray-900">Refunds</Link>
            <Link href="/contact" className="hover:text-gray-900">Contact</Link>
          </nav>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">© {year} Emoggle. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
