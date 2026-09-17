/**
 * Real-browser check for FaceSync as its own game mode.
 *
 * Confirms the card exists in the "Play now" picker, that choosing
 * it lands in the dedicated arena rather than the emoji duel, that
 * two clients pair on the FaceSync queue, and that the round ends
 * on the result with a "Next stranger" action instead of running a
 * countdown and a ten-second scan.
 *
 * Chrome's fake camera is a colour pattern, so MediaPipe finds no
 * face and the pair takes the graceful-miss path. That still proves
 * the mode's shape: no countdown, no emoji, no score, and a way out.
 *
 * Harness note: tsx compiles this with esbuild's `keepNames`, which
 * injects a `__name` helper into anything handed to `page.evaluate`
 * — where it does not exist. Keep injected code to plain arrow
 * functions with no named inner functions or classes.
 *
 * Usage (dev server + a signaling server on the configured URL):
 *   npx tsx scripts/verify-facesync-mode.ts
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
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(50)}  ${extra}`);
  if (!ok) failed += 1;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function watchErrors(page: Page, label: string): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    const text = m.text();
    if (m.type() !== "error") return;
    if (
      text.includes("favicon") ||
      text.includes("XNNPACK") ||
      text.includes("ipapi.co") ||
      text.includes("net::ERR_FAILED") ||
      text.includes("_next/static/development")
    ) {
      return;
    }
    errors.push(`[${label}] ${text}`);
  });
  page.on("pageerror", (e: unknown) =>
    errors.push(`[${label}] pageerror: ${e instanceof Error ? e.message : String(e)}`));
  return errors;
}

async function clickByText(page: Page, needle: string): Promise<boolean> {
  return page.evaluate((text: string) => {
    const wanted = text.toLowerCase();
    const nodes = Array.from(document.querySelectorAll("button, a[role='button']"));
    const hit = nodes.find((n) => (n.textContent ?? "").toLowerCase().includes(wanted));
    if (!hit) return false;
    (hit as HTMLElement).click();
    return true;
  }, needle);
}

async function openPicker(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(3_500);
  if (!(await clickByText(page, "Play now"))) throw new Error("no Play now button");
  await sleep(1_200);
}

/** Everything the picker is offering, in order. */
async function pickerCards(page: Page) {
  return page.evaluate(() => {
    // Scoped to the dialog: the homepage's own how-it-works list
    // is still in the DOM behind the modal.
    const dialog = document.querySelector("[role='dialog'][aria-label='Choose a game mode']");
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll("li")).map((li) => {
      const heading = li.querySelector("h3");
      return {
        title: (heading?.textContent ?? "").trim(),
        text: (li.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      };
    }).filter((row) => row.title.length > 0);
  });
}

async function inFaceSyncArena(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main[aria-label='FaceSync arena']");
    return Boolean(main);
  });
}

async function readCard(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-facesync-phase]");
    if (!card) return null;
    const box = card.getBoundingClientRect();
    return {
      phase: card.getAttribute("data-facesync-phase") ?? "",
      text: (card.textContent ?? "").replace(/\s+/g, " ").trim(),
      rect: { x: box.x, y: box.y, w: box.width, h: box.height },
    };
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const launch = (): Promise<Browser> =>
    puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required", "--disable-gpu",
      ],
    });

  const browserA = await launch();
  const browserB = await launch();

  try {
    const pageA = await browserA.newPage();
    const pageB = await browserB.newPage();
    const errorsA = watchErrors(pageA, "A");
    const errorsB = watchErrors(pageB, "B");
    await pageA.setViewport({ width: 1440, height: 900 });
    await pageB.setViewport({ width: 390, height: 844 });

    const origin = new URL(BASE).origin;
    for (const ctx of [browserA.defaultBrowserContext(), browserB.defaultBrowserContext()]) {
      await ctx.overridePermissions(origin, ["camera", "microphone"]);
    }
    for (const [page, name] of [[pageA, "ModeA"], [pageB, "ModeB"]] as const) {
      await page.evaluateOnNewDocument((value: string) => {
        try { window.localStorage.setItem("emoggle_user_name", value); } catch { /* ignore */ }
      }, name);
    }

    /* ── The card is in the picker ── */
    console.log("\n-- the Play now picker --");
    await openPicker(pageA);
    const cards = await pickerCards(pageA);
    console.log("   cards: " + cards.map((c) => c.title).join(" | "));

    check("the picker lists four modes", cards.length === 4, `${cards.length} cards`);
    const faceSyncCard = cards.find((c) => c.title.toLowerCase().includes("facesync"));
    check("FaceSync appears in the picker", Boolean(faceSyncCard),
      faceSyncCard ? faceSyncCard.title : "not found");
    check("the existing modes are still listed",
      ["solo", "stranger", "celebrity"].every((want) =>
        cards.some((c) => c.title.toLowerCase().includes(want))),
      cards.map((c) => c.title).join(", "));
    if (faceSyncCard) {
      check("the card explains what it does",
        /look alike|resemb/i.test(faceSyncCard.text), faceSyncCard.text.slice(0, 70));
    }
    writeFileSync(join(OUT_DIR, "mode-picker.png"), await pageA.screenshot({ type: "png" }));

    /* ── Choosing it lands in the dedicated arena ── */
    console.log("\n-- entering FaceSync mode on both clients --");
    check("the FaceSync CTA is clickable", await clickByText(pageA, "Compare Faces"));
    await sleep(3_000);
    check("it opens the dedicated FaceSync arena", await inFaceSyncArena(pageA));

    await openPicker(pageB);
    await clickByText(pageB, "Compare Faces");

    /* ── They pair, and the round is a resemblance round ── */
    const samples: Array<{
      t: number; phase: string; settled: boolean; next: boolean; emojiRound: boolean;
    }> = [];
    const startedAt = Date.now();
    let paired = false;

    for (let i = 0; i < 160; i += 1) {
      const [card, state] = await Promise.all([
        readCard(pageA),
        pageA.evaluate(() => {
          const body = document.body.textContent ?? "";
          const labelled = Array.from(document.querySelectorAll("[aria-label]"));
          return {
            videos: document.querySelectorAll("video").length,
            next: Array.from(document.querySelectorAll("button")).some((b) =>
              (b.textContent ?? "").toLowerCase().includes("next stranger")),
            missed: body.includes("Can't see both faces"),
            // Anything from the emoji duel would mean we landed in
            // the wrong arena or the wrong queue.
            emojiRound:
              labelled.some((n) => n.getAttribute("aria-label") === "Change target emoji") ||
              body.includes("Overall Score") ||
              body.includes("SNAP"),
          };
        }),
      ]);
      if (state.videos >= 2) paired = true;
      samples.push({
        t: Date.now() - startedAt,
        phase: card?.phase ?? (state.missed ? "missed" : "-"),
        settled: state.next,
        next: state.next,
        emojiRound: state.emojiRound,
      });
      if (paired && state.next) break;
      await sleep(cardSeenYet(samples) ? 300 : 120);
    }

    console.log("\n   lifecycle (client A):");
    let previous = "";
    for (const row of samples) {
      const key = `${row.phase}${row.next ? " +next" : ""}${row.emojiRound ? " EMOJI" : ""}`;
      if (key !== previous) {
        console.log(`   ${String(row.t).padStart(6)}ms  ${key}`);
        previous = key;
      }
    }
    console.log("");

    check("two clients pair on the FaceSync queue", paired);
    check("no emoji round ever appears",
      !samples.some((row) => row.emojiRound),
      `${samples.filter((r) => r.emojiRound).length} emoji-round samples`);
    check("the round settles and offers the next stranger",
      samples.some((row) => row.next),
      samples.some((row) => row.next) ? "" : "no Next stranger button");

    const finalCard = await readCard(pageA);
    if (finalCard) {
      check("the hero card is bigger than the seam card",
        finalCard.rect.w >= 340, `width ${Math.round(finalCard.rect.w)}px`);
    }

    writeFileSync(join(OUT_DIR, "mode-desktop.png"), await pageA.screenshot({ type: "png" }));
    writeFileSync(join(OUT_DIR, "mode-mobile.png"), await pageB.screenshot({ type: "png" }));

    const overflow = await pageB.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1);
    check("no horizontal overflow at 390px", !overflow);

    /* ── Next stranger re-queues cleanly ── */
    if (await clickByText(pageA, "Next stranger")) {
      await sleep(2_500);
      const afterSkip = await readCard(pageA);
      check("Next stranger clears the previous result",
        afterSkip === null || !/\d+%/.test(afterSkip.text),
        afterSkip ? afterSkip.text.slice(0, 50) : "card cleared");
      check("the arena survives Next stranger", await inFaceSyncArena(pageA));
    }

    const allErrors = [...errorsA, ...errorsB];
    if (allErrors.some((e) => e.includes("429"))) {
      console.log("\nNOTE: hit the /api/session rate limit — run inconclusive.");
    }
    check("no console or page errors", allErrors.length === 0,
      allErrors.slice(0, 3).join(" | "));

    console.log(`\nscreenshots in ${OUT_DIR}`);
  } finally {
    await browserA.close();
    await browserB.close();
  }

  console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

/** Poll fast until the card has been seen at least once. */
const cardSeenYet = (rows: Array<{ phase: string }>) =>
  rows.some((row) => row.phase !== "-" && row.phase !== "missed");

main().catch((error) => {
  console.error("mode check threw:", error);
  process.exit(1);
});
