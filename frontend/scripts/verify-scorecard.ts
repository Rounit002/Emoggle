/**
 * End-to-end headless verification of the share card capture flow.
 *
 * 1. Spins up a temporary Next.js dev server (or hits an existing
 *    one) that serves a tiny route which mounts the real
 *    `<ShareScoreCard>`.
 * 2. Runs `html-to-image.toBlob` against the live DOM with the
 *    same options `useShareScorecard` uses.
 * 3. Verifies the captured PNG is non-blank (size, color entropy,
 *    pixel content sample) and saves a copy for inspection.
 *
 * This test exists to catch regressions in the capture flow
 * (blank images, missing fonts, wrong dimensions) without needing
 * a full E2E suite.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const SCORECARD_TEST_PATH = "/verify-scorecard";

interface BlobCheck {
  ok: boolean;
  size?: number;
  width?: number;
  height?: number;
  isPng?: boolean;
  distinctColors?: number;
  reason?: string;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err: Error) => console.error("[pageerror]", err.message));
    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error" || t === "warn") {
        console.log(`[browser ${t}]`, msg.text());
      }
    });
    await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 1 });

    // Hit a tiny route we add to the dev server specifically for
    // this test. It mounts the real ShareScoreCard via the same
    // module path the app uses.
    const url = `${BASE}${SCORECARD_TEST_PATH}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for the scorecard DOM to be present.
    await page.waitForSelector("[data-emoggle-scorecard]", { timeout: 8000 });
    // Wait for fonts.
    await page.evaluate(async () => {
      if (typeof document !== "undefined" && document.fonts) {
        try { await document.fonts.ready; } catch {}
        try {
          await Promise.all([
            document.fonts.load("800 1em 'Quicksand'"),
            document.fonts.load("700 1em 'Plus Jakarta Sans'"),
            document.fonts.load("700 1em 'JetBrains Mono'"),
          ]);
        } catch {}
      }
    });
    // Two frames so the layout is fully committed.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    // Confirm the card is at the right size.
    const box = await page.evaluate(() => {
      const node = document.querySelector("[data-emoggle-scorecard]") as HTMLElement | null;
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    if (!box || box.w < 1000 || box.h < 1200) {
      console.error("FAIL: card has wrong dimensions:", box);
      process.exit(1);
    }
    console.log("card box:", box);

    // Now inject html-to-image and capture.
    await page.addScriptTag({
      url: "https://unpkg.com/html-to-image@1.11.13/dist/html-to-image.js",
    });
    const blobInfo = (await page.evaluate(async (): Promise<BlobCheck> => {
      // @ts-ignore
      const hti = (window as unknown as {
        htmlToImage: {
          toBlob: (n: HTMLElement, o?: Record<string, unknown>) => Promise<Blob | null>;
        };
      }).htmlToImage;
      const node = document.querySelector("[data-emoggle-scorecard]") as HTMLElement | null;
      if (!node) return { ok: false, reason: "no node" };
      if (!hti) return { ok: false, reason: "no hti" };
      let blob: Blob | null = null;
      try {
        blob = await hti.toBlob(node, {
          width: 1080,
          height: 1350,
          pixelRatio: 1,
          backgroundColor: "#fff8d6",
          cacheBust: true,
          style: {
            transform: "none",
            left: "0",
            top: "0",
            width: "1080px",
            height: "1350px",
            position: "fixed",
            visibility: "visible",
            pointerEvents: "none",
          },
          skipFonts: true,
        });
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "render threw" };
      }
      if (!blob) return { ok: false, reason: "no blob" };
      // Validate.
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const isPng =
        u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
      const img = new Image();
      const url = URL.createObjectURL(blob);
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return { ok: false, reason: "no ctx" };
      ctx.drawImage(img, 0, 0);
      const channels = new Set<number>();
      for (let i = 0; i < 600; i += 1) {
        const x = Math.floor(Math.random() * c.width);
        const y = Math.floor(Math.random() * c.height);
        const px = ctx.getImageData(x, y, 1, 1).data;
        channels.add((px[0] >> 3) * 17 + (px[1] >> 3) * 31 + (px[2] >> 3) * 7);
      }
      return {
        ok: true,
        size: blob.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        isPng,
        distinctColors: channels.size,
      };
    })) as BlobCheck;

    if (!blobInfo.ok) {
      console.error("FAIL: capture failed:", blobInfo);
      process.exit(1);
    }
    console.log("capture:", blobInfo);
    if (!blobInfo.isPng) { console.error("FAIL: not PNG"); process.exit(1); }
    if ((blobInfo.size ?? 0) < 4096) { console.error("FAIL: too small"); process.exit(1); }
    if ((blobInfo.distinctColors ?? 0) < 8) { console.error("FAIL: looks blank"); process.exit(1); }
    if (blobInfo.width !== 1080 || blobInfo.height !== 1350) {
      console.error("FAIL: wrong dimensions", blobInfo.width, blobInfo.height);
      process.exit(1);
    }
    // Save a copy.
    const base64 = await page.evaluate(async (): Promise<string | null> => {
      const node = document.querySelector("[data-emoggle-scorecard]") as HTMLElement | null;
      if (!node) return null;
      // @ts-ignore
      const hti = (window as unknown as {
        htmlToImage: { toBlob: (n: HTMLElement, o?: Record<string, unknown>) => Promise<Blob | null> };
      }).htmlToImage;
      const blob = await hti.toBlob(node, {
        width: 1080, height: 1350, pixelRatio: 1, backgroundColor: "#fff8d6",
        cacheBust: true, skipFonts: true,
        style: { transform: "none", left: "0", top: "0", width: "1080px", height: "1350px", position: "fixed", visibility: "visible", pointerEvents: "none" },
      });
      if (!blob) return null;
      return await new Promise<string | null>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === "string" ? r.result.split(",")[1] ?? null : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(blob);
      });
    });
    if (!base64) { console.error("FAIL: save failed"); process.exit(1); }
    const out = join(__dirname, "..", ".tmp-scorecard.png");
    writeFileSync(out, Buffer.from(base64, "base64"));
    console.log(`wrote ${out} (${statSync(out).size} bytes)`);
    console.log("OK: share card capture is non-blank, valid PNG, correct dimensions.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
