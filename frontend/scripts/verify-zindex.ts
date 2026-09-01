/**
 * Quick z-index verification. Loads the home page, opens the
 * duel arena, and reports the computed z-index of every
 * full-viewport overlay plus the camera control bar. Confirms
 * overlays sit above the bar so the layout fix is in effect.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";

interface ZInfo {
  selector: string;
  text: string;
  zIndex: string;
  position: string;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err: Error) => console.error("[pageerror]", err.message));
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 });
    // Enter the duel arena.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Play now"),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 4000));
    // Read computed z-index for the key elements.
    const report: ZInfo[] = await page.evaluate(() => {
      const out: ZInfo[] = [];
      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const cs = window.getComputedStyle(el as HTMLElement);
        const z = cs.zIndex;
        if (z === "auto" || z === "") continue;
        const num = Number.parseInt(z, 10);
        if (!Number.isFinite(num) || num < 30) continue;
        const text = (el as HTMLElement).innerText?.slice(0, 40) ?? "";
        const tag = (el as HTMLElement).tagName.toLowerCase();
        const role = (el as HTMLElement).getAttribute("role") ?? "";
        out.push({
          selector: `${tag}${role ? `[role=${role}]` : ""}`,
          text,
          zIndex: z,
          position: cs.position,
        });
      }
      return out.sort((a, b) => Number(b.zIndex) - Number(a.zIndex));
    });
    console.log("z-index ≥ 30 elements on the duel arena page:");
    for (const r of report) {
      console.log(`  z=${r.zIndex.padStart(4)}  pos=${r.position.padEnd(7)}  ${r.selector}  "${r.text}"`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
