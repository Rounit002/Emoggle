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

/** Click a button whose visible text contains `needle`. */
async function clickByText(page: Page, needle: string): Promise<boolean> {
  return page.evaluate((text: string) => {
    const nodes = Array.from(document.querySelectorAll("button, a[role='button']"));
    const hit = nodes.find((node) => (node.textContent ?? "").includes(text));
    if (!hit) return false;
    (hit as HTMLElement).click();
    return true;
  }, needle);
}

/** Read the FaceSync card's rendered state, if it is on screen. */
async function readCard(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("[role='status']"));
    const card = nodes.find((node) => (node.textContent ?? "").includes("FaceSync"));
    if (!card) return null;
    const box = card.getBoundingClientRect();
    return {
      text: (card.textContent ?? "").replace(/\s+/g, " ").trim(),
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
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
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

    await pageA.setViewport({ width: 1440, height: 900 });
    await pageB.setViewport({ width: 1440, height: 900 });

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

    // Give matchmaking + PeerJS time to settle.
    let matched = false;
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      if ((await inArena(pageA)) && (await inArena(pageB))) {
        matched = true;
        break;
      }
    }
    check("both clients reach the arena", matched);

    // The lead-in is live now. Catch the card while it is up.
    let cardSeen: Awaited<ReturnType<typeof readCard>> = null;
    for (let i = 0; i < 24; i += 1) {
      const card = await readCard(pageA);
      if (card) {
        cardSeen = card;
        break;
      }
      await sleep(250);
    }

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
      writeFileSync(join(OUT_DIR, "desktop-lead-in.png"),
        await pageA.screenshot({ type: "png" }));
    }

    /*
     * With a synthetic camera there is no face, so both sides must
     * bypass and the round must start regardless. Sampled as a
     * timeline rather than a single probe: a single probe cannot
     * tell a card that lingered from one that cleared a moment
     * after we happened to look.
     */
    const timeline: Array<{ t: number; card: boolean; round: boolean }> = [];
    const startedAt = Date.now();
    let roundStarted = false;
    let cardGoneAt: number | null = null;

    for (let i = 0; i < 60; i += 1) {
      const [card, round] = await Promise.all([
        readCard(pageA),
        // Unambiguous round markers from the arena's own controls,
        // rather than loose text matching: the change-emoji button
        // exists only in the pre-scan window, the score readout
        // only while playing.
        pageA.evaluate(() => {
          const labelled = Array.from(document.querySelectorAll("[aria-label]"));
          const hasEmojiControl = labelled.some(
            (node) => node.getAttribute("aria-label") === "Change target emoji",
          );
          const body = document.body.textContent ?? "";
          return hasEmojiControl || body.includes("Overall Score") || body.includes("SNAP");
        }),
      ]);
      timeline.push({ t: Date.now() - startedAt, card: card !== null, round });
      if (round) roundStarted = true;
      if (card === null && cardGoneAt === null && timeline.length > 1) {
        cardGoneAt = Date.now() - startedAt;
      }
      if (roundStarted && cardGoneAt !== null) break;
      await sleep(400);
    }

    const firstRound = timeline.find((row) => row.round);
    check("the emoji round starts despite no face", roundStarted,
      firstRound ? `round visible at ${firstRound.t}ms` : "never started");
    check("the card is torn down before the round", cardGoneAt !== null,
      cardGoneAt === null ? "card still up" : `cleared at ${cardGoneAt}ms`);
    check("the card and the round never overlap",
      !timeline.some((row) => row.card && row.round),
      `${timeline.filter((row) => row.card && row.round).length} overlapping samples`);

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

    /* ── Repeated strangers ── */
    // The arena has no in-round skip control; a new stranger is
    // reached through "Play Again" on the result screen. Each
    // cycle must produce a fresh FaceSync run with no trace of the
    // previous one.
    console.log("\n-- consecutive strangers --");
    await pageA.setViewport({ width: 1440, height: 900 });
    let cycles = 0;
    let staleResult = false;

    for (let round = 0; round < 2; round += 1) {
      // Wait out the round and the result screen.
      let sawPlayAgain = false;
      for (let i = 0; i < 60; i += 1) {
        const present = await pageA.evaluate(() =>
          Array.from(document.querySelectorAll("button")).some((b) =>
            (b.textContent ?? "").includes("Play Again"),
          ),
        );
        if (present) {
          sawPlayAgain = true;
          break;
        }
        await sleep(500);
      }
      if (!sawPlayAgain) break;

      await clickByText(pageA, "Play Again");
      await sleep(1_000);

      // Re-queue both sides so a new pairing can happen.
      await clickByText(pageB, "Play Again");

      let rematched = false;
      for (let i = 0; i < 50; i += 1) {
        await sleep(500);
        const card = await readCard(pageA);
        if (card) {
          // A percentage on a fresh run would mean a leaked result,
          // since neither synthetic camera can produce one.
          if (/\d+%/.test(card.text)) staleResult = true;
          rematched = true;
          break;
        }
        if (await inArena(pageA)) rematched = true;
      }
      if (rematched) cycles += 1;
    }

    check("consecutive strangers each start cleanly", cycles >= 1, `${cycles} cycles completed`);
    check("no result leaks from the previous stranger", !staleResult);

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
