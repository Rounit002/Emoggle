/**
 * Visual verification for the new Choose Game Mode modal.
 * Loads the home page on a mobile viewport, clicks "Play now",
 * and screenshots the modal.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Puppeteer types page-level errors as `unknown`, because a page can reject
// with any value, not only an Error.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
    page.on("pageerror", (err: unknown) => console.error("[pageerror]", errorText(err)));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    // Click "Play now".
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Play now"),
      );
      btn?.click();
    });
    // Wait for the modal to appear.
    await page.waitForSelector("[role='dialog'][aria-label='Choose a game mode']", { timeout: 5000 });
    const buf = await page.screenshot({ type: "png" });
    const out = join(__dirname, "..", ".tmp-mode-picker.png");
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
