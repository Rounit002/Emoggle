/**
 * Diagnostic: records the FaceSync lifecycle in a real browser,
 * timestamped INSIDE the page.
 *
 * Two earlier attempts were wrong in instructive ways. Polling from
 * Node produced nonsense — four countdown ticks sharing a
 * millisecond — because the driver's own `page.evaluate` calls
 * starved the CDP event loop. Wrapping `window.WebSocket` in a
 * subclass silently broke the whole injected script, so nothing
 * recorded at all. This version injects only plain functions and
 * reads the card's `data-facesync-phase` attribute, which the
 * component exposes for exactly this purpose.
 */
import puppeteer, { type Page } from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LogRow = { t: number; what: string };

async function installRecorder(page: Page, playerName: string) {
  await page.evaluateOnNewDocument((name: string) => {
    const w = window as unknown as { __fsLog?: LogRow[] };
    try {
      window.localStorage.setItem("emoggle_user_name", name);
    } catch {
      /* storage blocked */
    }
    w.__fsLog = [{ t: 0, what: "recorder installed" }];

    let lastPhase: string | null = null;
    let lastVideos = "";
    window.setInterval(() => {
      const log = (what: string) =>
        w.__fsLog!.push({ t: Math.round(performance.now()), what });

      const card = document.querySelector("[data-facesync-phase]");
      const phase = card ? card.getAttribute("data-facesync-phase") : null;
      if (phase !== lastPhase) {
        log(
          phase
            ? `phase=${phase} samples=${card!.getAttribute("data-facesync-samples")}`
            : "card gone",
        );
        lastPhase = phase;
      }

      const videos = Array.from(document.querySelectorAll("video"))
        .map((v) => `${v.videoWidth}x${v.videoHeight}/${v.readyState}`)
        .join(" ");
      if (videos !== lastVideos) {
        log(`videos: ${videos || "(none)"}`);
        lastVideos = videos;
      }
    }, 100);
  }, playerName);
}

async function enter(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(1_200);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent ?? "").includes("Play now"));
    (b as HTMLElement | undefined)?.click();
  });
  await sleep(800);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      (x.textContent ?? "").includes("Find a Match"));
    (b as HTMLElement | undefined)?.click();
  });
}

async function dump(page: Page, label: string) {
  const rows = (await page.evaluate(
    () => (window as unknown as { __fsLog?: LogRow[] }).__fsLog ?? [],
  )) as LogRow[];
  console.log(`\n--- ${label} (page clock) ---`);
  for (const row of rows) console.log(`${String(row.t).padStart(7)}ms  ${row.what}`);
}

async function main() {
  const args = [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required", "--disable-gpu",
  ];
  const bA = await puppeteer.launch({ executablePath: CHROME, headless: true, args });
  const bB = await puppeteer.launch({ executablePath: CHROME, headless: true, args });

  try {
    const pageA = await bA.newPage();
    const pageB = await bB.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageB.setViewport({ width: 1280, height: 800 });
    await installRecorder(pageA, "DiagA");
    await installRecorder(pageB, "DiagB");

    await enter(pageA);
    await sleep(600);
    await enter(pageB);

    // Stay out of the way while the lead-in and round play out.
    await sleep(32_000);

    await dump(pageA, "client A");
    await dump(pageB, "client B");
  } finally {
    await bA.close();
    await bB.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
