/**
 * Visual verification for the result screen + lobby overlay
 * layout. Loads the dev server, triggers the no-match overlay,
 * and takes a screenshot to confirm the score bar no longer
 * bleeds through.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err: Error) => console.error("[pageerror]", err.message));
    // Mobile viewport — this is where the original screenshot
    // showed the overlap.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    // Click "Play now" to enter the duel arena, then wait for the
    // no-match overlay to appear.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Play now"),
      );
      btn?.click();
    });
    // The no-match overlay appears after ~6s of waiting.
    await new Promise((r) => setTimeout(r, 15000));
    const overlayVisible = await page.evaluate(() => {
      const text = Array.from(document.querySelectorAll("h2"))
        .find((el) => el.textContent?.includes("No rivals around"));
      return Boolean(text);
    });
    console.log("no-rivals overlay visible:", overlayVisible);
    if (!overlayVisible) {
      console.log("still in lobby state — checking overlay rendering anyway");
    }
    const buf = await page.screenshot({ type: "png" });
    const out = join(__dirname, "..", ".tmp-no-match.png");
    writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
