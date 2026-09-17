/**
 * Does the "Play now" mode picker actually scroll with the wheel?
 *
 * The picker grew a fourth card, so on shorter viewports the list
 * overflows. Two separate things can stop it scrolling and both
 * look identical to a user:
 *
 *   - the scroll container is a flex child without `min-h-0`, so it
 *     refuses to shrink below its content and never overflows at
 *     all — there is nothing to scroll, natively or otherwise
 *   - Lenis runs as the root smooth-scroll and swallows wheel
 *     events document-wide, so a nested scroller that has not
 *     opted out with `data-lenis-prevent` never sees them
 *
 * So this checks BOTH: that the container is genuinely scrollable
 * (scrollHeight > clientHeight), and that a real wheel event
 * dispatched over it actually moves scrollTop.
 *
 * Harness note: tsx compiles with esbuild's `keepNames`, which
 * injects a `__name` helper into anything handed to
 * `page.evaluate` — where it does not exist. Keep injected code to
 * plain arrow functions, no named inner functions or classes.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const OUT_DIR = join(__dirname, "..", ".tmp-facesync");

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(48)}  ${extra}`);
  if (!ok) failed += 1;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The picker's scrolling list, and how it is currently sized. */
async function scroller(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog'][aria-label='Choose a game mode']");
    if (!dialog) return null;
    const list = dialog.querySelector("[data-lenis-prevent]")
      ?? Array.from(dialog.querySelectorAll("div")).find(
        (d) => d.scrollHeight > d.clientHeight + 4);
    if (!list) return null;
    const box = list.getBoundingClientRect();
    return {
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      optedOutOfLenis: list.hasAttribute("data-lenis-prevent"),
      centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    };
  });
}

async function openPicker(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(3_500);
  const opened = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent ?? "").includes("Play now"));
    if (!b) return false;
    (b as HTMLElement).click();
    return true;
  });
  await sleep(1_400);
  return opened;
}

async function run(width: number, height: number, label: string) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(() => {
      try { window.localStorage.setItem("emoggle_user_name", "ScrollTester"); } catch { /* ignore */ }
    });

    console.log(`\n-- ${label} (${width}x${height}) --`);
    check("the picker opens", await openPicker(page));

    const before = await scroller(page);
    if (!before) {
      check("found the picker's scroll container", false, "no scroller in the dialog");
      return;
    }

    check("the scroll container opts out of Lenis", before.optedOutOfLenis);
    const overflowing = before.scrollHeight > before.clientHeight + 4;
    check("the list actually overflows (so there is something to scroll)",
      overflowing,
      `content ${before.scrollHeight}px in a ${before.clientHeight}px box`);

    if (!overflowing) {
      console.log("   (viewport is tall enough to fit all four cards — nothing to scroll)");
      return;
    }

    // A real wheel event over the list, the way a mouse produces it.
    await page.mouse.move(before.centre.x, before.centre.y);
    await page.mouse.wheel({ deltaY: 400 });
    await sleep(700);

    const after = await scroller(page);
    check("the mouse wheel scrolls the list",
      Boolean(after) && after!.scrollTop > before.scrollTop + 10,
      `scrollTop ${before.scrollTop} -> ${after?.scrollTop}`);

    // And back up again, so it is not a one-way trip.
    await page.mouse.wheel({ deltaY: -400 });
    await sleep(700);
    const back = await scroller(page);
    check("the wheel scrolls back up",
      Boolean(back) && back!.scrollTop < (after?.scrollTop ?? 0) - 10,
      `scrollTop ${after?.scrollTop} -> ${back?.scrollTop}`);

    // The last card has to be reachable, or a mode is unusable.
    await page.mouse.wheel({ deltaY: 2000 });
    await sleep(800);
    const bottom = await scroller(page);
    const reachedEnd =
      Boolean(bottom) &&
      bottom!.scrollTop + bottom!.clientHeight >= bottom!.scrollHeight - 8;
    check("the bottom of the list is reachable", reachedEnd,
      `${bottom?.scrollTop} + ${bottom?.clientHeight} vs ${bottom?.scrollHeight}`);

    const lastCardVisible = await page.evaluate(() => {
      const dialog = document.querySelector("[role='dialog'][aria-label='Choose a game mode']");
      const cards = Array.from(dialog?.querySelectorAll("li") ?? []);
      const last = cards[cards.length - 1];
      if (!last) return false;
      const box = last.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    });
    check("the last mode card is on screen after scrolling", lastCardVisible);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, `picker-scrolled-${width}x${height}.png`),
      await page.screenshot({ type: "png" }),
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  // A laptop that is short enough to overflow, and a phone.
  await run(1280, 620, "short laptop");
  await run(390, 720, "phone");
  console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("scroll check threw:", error);
  process.exit(1);
});
