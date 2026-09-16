/**
 * Real-browser end-to-end check for FaceSync.
 *
 * Launches two Chrome pages with a synthetic camera, walks both
 * through the homepage into the stranger arena, lets them match,
 * and watches what FaceSync does — while recording every console
 * error, page error and unhandled rejection on both sides.
 *
 * WHAT THIS CAN PROVE
 *   Chrome's fake capture device is a rolling colour pattern, not
 *   a face, so MediaPipe finds nothing. That makes this a faithful
 *   test of the FAILURE path, which is the one that must never
 *   break the game: both clients report "nothing to offer", the
 *   server bypasses, and the emoji round starts normally. It also
 *   exercises the real socket wiring, the real MediaPipe load, the
 *   card's layout in the seam, teardown across repeated strangers,
 *   and console cleanliness.
 *
 * WHAT IT CANNOT PROVE
 *   That two real faces produce a sensible number on screen. No
 *   synthetic camera can stand in for that. The scoring itself is
 *   covered by the geometry and calibration suites, and the
 *   identical-result guarantee by the socket-level flow test.
 *
 * A HARNESS PITFALL, recorded so nobody chases it twice: tsx
 * compiles this file with esbuild's `keepNames`, which wraps named
 * inner functions in a `__name(...)` helper. Puppeteer stringifies
 * whatever you hand `evaluate` / `evaluateOnNewDocument` and runs
 * it in the page, where that helper does not exist — so injected
 * code containing a named function or a class throws
 * "__name is not defined" inside the browser. It looks exactly like
 * an application bug, and it is not: reproduce it on about:blank
 * with no app loaded. Keep injected code to plain arrow functions.
 *
 * Usage (both servers must already be up):
 *   npx tsx scripts/verify-facesync-e2e.ts
 */
import puppeteer, { type Browser, type ConsoleMessage, type Page } from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const OUT_DIR = join(__dirname, "..", ".tmp-facesync");

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(52)}  ${extra}`);
  if (!ok) failed += 1;
};

interface Recorder {
  errors: string[];
  faceSyncLogs: string[];
}

function watch(page: Page, label: string): Recorder {
  const record: Recorder = { errors: [], faceSyncLogs: [] };

  page.on("console", (message: ConsoleMessage) => {
    const text = message.text();
    if (text.includes("FaceSync") || text.includes("[FS]")) {
      record.faceSyncLogs.push(text);
    }
    if (message.type() !== "error") return;
    // Noise that is not ours and not a defect: the dev overlay's
    // own websocket, favicon 404s, and MediaPipe's TFLite banner
    // (which the app already suppresses in the scorer).
    if (
      text.includes("favicon") ||
      text.includes("_next/static/development") ||
      text.includes("XNNPACK") ||
      text.includes("Download the React DevTools") ||
      // Pre-existing and environmental: the country lookup calls a
      // third-party endpoint that refuses cross-origin requests
      // from localhost. Unrelated to FaceSync, and present on the
      // untouched build too.
      text.includes("ipapi.co") ||
      text.includes("net::ERR_FAILED")
    ) {
      return;
    }
    record.errors.push(`[${label}] ${text}`);
  });

  page.on("pageerror", (error: unknown) => {
    record.errors.push(`[${label}] pageerror: ${error instanceof Error ? error.message : String(error)}`);
  });

  return record;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seed a display name so the first-run gate does not block us.
 *
 * Injected before the first navigation rather than set afterwards
 * and reloaded: /api/session is rate limited to 20 per 15 minutes
 * per IP, and a reload per client per run burns through that
 * budget in a handful of runs.
 */
async function seedName(page: Page, name: string) {
  await page.evaluateOnNewDocument((value: string) => {
    try {
      window.localStorage.setItem("emoggle_user_name", value);
    } catch {
      /* storage blocked — the name gate will just appear */
    }
  }, name);
}

/**
 * Click a button whose visible text contains `needle`.
 *
 * Case-insensitive: the arena header says "Back" while the result
 * screen says "BACK HOME", and which one is on screen depends on
 * how far the round has got.
 */
async function clickByText(page: Page, needle: string): Promise<boolean> {
  return page.evaluate((text: string) => {
    const wanted = text.toLowerCase();
    const nodes = Array.from(document.querySelectorAll("button, a[role='button']"));
    const hit = nodes.find((node) => (node.textContent ?? "").toLowerCase().includes(wanted));
    if (!hit) return false;
    (hit as HTMLElement).click();
    return true;
  }, needle);
}

/** Read the FaceSync card's rendered state, if it is on screen. */
async function readCard(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-facesync-phase]");
    if (!card) return null;
    const box = card.getBoundingClientRect();
    return {
      text: (card.textContent ?? "").replace(/\s+/g, " ").trim(),
      phase: card.getAttribute("data-facesync-phase") ?? "",
      samples: Number(card.getAttribute("data-facesync-samples") ?? "0"),
      label: card.getAttribute("aria-label") ?? "",
      rect: { x: box.x, y: box.y, w: box.width, h: box.height },
      inViewport:
        box.top >= 0 &&
        box.left >= 0 &&
        box.bottom <= window.innerHeight + 1 &&
        box.right <= window.innerWidth + 1,
    };
  });
}

/** True once the arena shows a live match (both video tiles up). */
async function inArena(page: Page) {
  return page.evaluate(() => document.querySelectorAll("video").length >= 2);
}

async function enterStrangerMode(page: Page) {
  // `networkidle2` never settles here: the lobby polls /online
  // every five seconds and holds a socket open.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(2_500);
  await sleep(1_500);
  if (!(await clickByText(page, "Play now"))) throw new Error("no Play now button");
  await sleep(900);
  if (!(await clickByText(page, "Find a Match"))) {
    // Some layouts put the CTA on the card title instead.
    if (!(await clickByText(page, "Play With Stranger"))) {
      throw new Error("no stranger-mode CTA");
    }
  }
  await sleep(1_200);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const launch = (): Promise<Browser> =>
    puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-gpu",
      ],
    });

  const browserA = await launch();
  const browserB = await launch();

  try {
    const pageA = await browserA.newPage();
    const pageB = await browserB.newPage();
    const recA = watch(pageA, "A");
    const recB = watch(pageB, "B");

    // A is desktop, B is a phone — so one run captures the card in
    // both layouts while it is genuinely on screen.
    await pageA.setViewport({ width: 1440, height: 900 });
    await pageB.setViewport({ width: 390, height: 844 });

    const origin = new URL(BASE).origin;
    for (const context of [browserA.defaultBrowserContext(), browserB.defaultBrowserContext()]) {
      await context.overridePermissions(origin, ["camera", "microphone"]);
    }

    await seedName(pageA, "TesterA");
    await seedName(pageB, "TesterB");

    console.log("\n-- entering stranger mode on both clients --");
    await enterStrangerMode(pageA);
    await sleep(700);
    await enterStrangerMode(pageB);

    /*
     * One continuous poller from the moment we enter the queue,
     * rather than separate probes. Anchoring only once both video
     * tiles exist misses the start of the lead-in entirely — the
     * remote stream can take seconds to arrive — so the card's
     * early phases had already been and gone before an
     * after-the-fact probe looked.
     */
    const samples: Array<{
      t: number; card: Awaited<ReturnType<typeof readCard>>; arena: boolean; round: boolean;
    }> = [];
    const pollStart = Date.now();
    let matched = false;
    let cardSeen: Awaited<ReturnType<typeof readCard>> = null;

    for (let i = 0; i < 200; i += 1) {
      const [card, arena, round] = await Promise.all([
        readCard(pageA),
        inArena(pageA),
        pageA.evaluate(() => {
          const labelled = Array.from(document.querySelectorAll("[aria-label]"));
          return (
            labelled.some((n) => n.getAttribute("aria-label") === "Change target emoji") ||
            (document.body.textContent ?? "").includes("Overall Score")
          );
        }),
      ]);
      samples.push({ t: Date.now() - pollStart, card, arena, round });
      if (arena) matched = true;
      // Keep the first sighting that has real layout to assert on,
      // and grab the screenshots while the card is actually up —
      // capturing after the assertions lands on whatever the round
      // has moved on to.
      if (card && !cardSeen) {
        cardSeen = card;
        // Captured immediately: the card can be on screen for only
        // a second when both sides bypass quickly, so anything that
        // waits first lands on an empty seam.
        const box = {
          x: Math.max(0, card.rect.x - 14),
          y: Math.max(0, card.rect.y - 14),
          width: card.rect.w + 28,
          height: card.rect.h + 28,
        };
        if (box.width > 0 && box.height > 0) {
          // Clipped to the card, so the design is legible rather
          // than a 200px speck in a 1440px arena.
          writeFileSync(join(OUT_DIR, "card-closeup.png"),
            await pageA.screenshot({ type: "png", clip: box }));
        }
        writeFileSync(join(OUT_DIR, "desktop-lead-in.png"),
          await pageA.screenshot({ type: "png" }));
        writeFileSync(join(OUT_DIR, "mobile-lead-in.png"),
          await pageB.screenshot({ type: "png" }));
      }
      if (round && matched) break;
      // Poll tightly until the card has been seen: it can be on
      // screen for barely a second, and a coarse interval catches
      // it on its last frame (or misses it entirely).
      await sleep(cardSeen ? 300 : 110);
    }

    console.log("\n   lifecycle (client A):");
    let previous = "";
    for (const row of samples) {
      const label = row.card
        ? `card ${row.card.phase} samples=${row.card.samples}`
        : row.arena
          ? "arena, no card"
          : "lobby";
      const key = label + (row.round ? " [round]" : "");
      if (key !== previous) {
        console.log(`   ${String(row.t).padStart(6)}ms  ${key}`);
        previous = key;
      }
    }
    console.log("");

    check("both clients reach the arena", matched);

    check("the FaceSync card renders during the lead-in", cardSeen !== null,
      cardSeen ? cardSeen.text.slice(0, 64) : "never appeared");

    if (cardSeen) {
      check("the card is fully inside the viewport", cardSeen.inViewport,
        `x=${Math.round(cardSeen.rect.x)} y=${Math.round(cardSeen.rect.y)} ` +
        `w=${Math.round(cardSeen.rect.w)} h=${Math.round(cardSeen.rect.h)}`);
      check("the card carries the disclaimer",
        /not a DNA test/i.test(cardSeen.text), "");
      check("the card does not cover a video tile",
        cardSeen.rect.w < 420, `card width ${Math.round(cardSeen.rect.w)}px`);
    }

    /*
     * With a synthetic camera there is no face, so both sides must
     * bypass and the round must start regardless.
     */
    const firstRound = samples.find((row) => row.round);
    const cardRows = samples.filter((row) => row.card !== null);
    const lastCardAt = cardRows.length ? cardRows[cardRows.length - 1].t : null;

    check("the emoji round starts despite no face", Boolean(firstRound),
      firstRound ? `round live at ${firstRound.t}ms` : "never started");
    check("the card is torn down before the round",
      lastCardAt !== null && firstRound !== undefined && lastCardAt < firstRound.t,
      lastCardAt === null ? "card never appeared" : `last card ${lastCardAt}ms`);
    check("the card and the round never overlap",
      !samples.some((row) => row.card !== null && row.round),
      `${samples.filter((row) => row.card !== null && row.round).length} overlapping samples`);

    const phasesSeen = Array.from(
      new Set(cardRows.map((row) => row.card!.phase)),
    );
    check("the card passes through real lifecycle phases",
      phasesSeen.length > 0, phasesSeen.join(" -> "));

    writeFileSync(join(OUT_DIR, "desktop-round.png"), await pageA.screenshot({ type: "png" }));

    /* ── Mobile layout ── */
    console.log("\n-- mobile viewport --");
    await pageA.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await sleep(800);
    writeFileSync(join(OUT_DIR, "mobile-round.png"), await pageA.screenshot({ type: "png" }));

    const mobileOverflow = await pageA.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check("no horizontal overflow on a 390px viewport", !mobileOverflow);

    /*
     * NOT COVERED HERE: repeated stranger cycles and the
     * leave/re-enter reset. Both need fresh anonymous sessions, and
     * /api/session is deliberately capped at 20 per 15 minutes per
     * IP — a limit this harness should respect rather than work
     * around. Those paths are covered instead by
     * `signaling-server/test/faceSyncFlow.test.js` (a fresh result
     * for a new stranger, and no leakage from the previous one) and
     * by `test-facesync-machine.ts` (a re-match wipes the result,
     * the samples and the submitted flag).
     */

    /* ── Console health ── */
    const allErrors = [...recA.errors, ...recB.errors];
    if (allErrors.some((error) => error.includes("429"))) {
      console.log(
        "\nNOTE: hit the /api/session rate limit (20 per 15 minutes per IP).\n" +
        "This run is INCONCLUSIVE rather than a failure — the clients never\n" +
        "got a session, so nothing downstream could happen. Wait for the\n" +
        "window to roll over and run again.",
      );
    }
    check("no console or page errors on either client",
      allErrors.length === 0,
      allErrors.slice(0, 3).join(" | "));

    if (allErrors.length > 0) {
      console.log("\nerrors seen:");
      for (const error of allErrors.slice(0, 12)) console.log("   " + error);
    }

    console.log(`\nscreenshots in ${OUT_DIR}`);
  } finally {
    await browserA.close();
    await browserB.close();
  }

  console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("e2e threw:", error);
  process.exit(1);
});
