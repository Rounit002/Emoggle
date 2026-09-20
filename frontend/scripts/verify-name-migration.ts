/**
 * Does the display name survive the move to Supabase?
 *
 * The name used to live in localStorage and nowhere else. It now
 * lives in a Supabase `profiles` row, with localStorage demoted to
 * a mirror. Three things must stay true through that change, and
 * all three are invisible from the code alone:
 *
 *   - a brand-new player is still asked for a name, once
 *   - a returning player is NOT asked again, and never sees the
 *     first-time modal flash before their name resolves
 *   - a player who already had a name in localStorage before this
 *     change keeps it
 *
 * This script drives the real page in real Chrome for each case.
 * It deliberately does not require Supabase credentials: with none
 * configured the app takes its fallback path, which is the exact
 * behaviour it had before this work and therefore the thing most
 * worth regression-testing. Run it again with
 * NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY set in the dev server's
 * environment to exercise the database path — the assertions are
 * the same either way, which is the point.
 *
 * Usage:  npm run dev   (in one terminal)
 *         npm run verify:name-migration
 *
 * Harness note: tsx compiles with esbuild's `keepNames`, which
 * injects a `__name` helper into anything handed to
 * `page.evaluate` — where it does not exist. Keep injected code to
 * plain arrow functions, no named inner functions or classes.
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";

const NAME_KEY = "emoggle_user_name";
const PENDING_KEY = "emoggle_user_name_pending";

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(52)}  ${extra}`);
  if (!ok) failed += 1;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Is the first-time name gate on screen right now? */
async function nameGateVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog'][aria-label='Choose a name']");
    if (!dialog) return false;
    // AnimatePresence keeps the node mounted through its exit
    // animation, so presence alone is not "visible".
    return getComputedStyle(dialog).opacity !== "0";
  });
}

/** What the app currently believes the player is called, read from
 *  the header chip rather than from storage — this is the value a
 *  player actually sees. */
async function chipName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const chip = document.querySelector("[aria-label='Edit your name']");
    if (!chip) return null;
    // The chip also carries a country flag; the name is the first
    // non-empty text node's worth of content.
    return (chip.textContent ?? "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim() || null;
  });
}

async function storageState(page: Page) {
  return page.evaluate(
    ([nameKey, pendingKey]) => ({
      name: localStorage.getItem(nameKey),
      pending: localStorage.getItem(pendingKey),
      // Present only when Supabase is configured and signed in.
      supabaseSession: localStorage.getItem("emoggle_supabase_auth") !== null,
    }),
    [NAME_KEY, PENDING_KEY],
  );
}

/** A page with a clean profile, optionally pre-seeded with the
 *  localStorage name an existing player would already have. */
async function freshPage(browser: Browser, seedName?: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Seed before any app code runs, so the provider's first read
  // sees it — exactly like a returning player's browser.
  //
  // `evaluateOnNewDocument` runs on every navigation, including
  // reloads, so the seed guards itself with a sentinel. Without it
  // a reload would silently restore the seeded name over whatever
  // the app saved, and the "survives a reload" assertions would
  // pass no matter what the app did.
  if (seedName !== undefined) {
    await page.evaluateOnNewDocument(
      ([key, value, sentinel]) => {
        try {
          if (localStorage.getItem(sentinel)) return;
          localStorage.setItem(key, value);
          localStorage.setItem(sentinel, "1");
        } catch {
          /* private mode — the app handles this, the test need not */
        }
      },
      [NAME_KEY, seedName, "__verify_seeded"],
    );
  }
  await page.goto(BASE, { waitUntil: "networkidle2" });
  return page;
}

async function typeName(page: Page, value: string) {
  const input = await page.waitForSelector("[role='dialog'] input[type='text']", {
    timeout: 10_000,
  });
  await input!.click();
  await input!.type(value);
  await page.click("[role='dialog'] button[type='submit']");
  // Let the optimistic write and the re-render land.
  await sleep(400);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream"],
  });

  const consoleErrors: string[] = [];

  try {
    /* ── 1. Brand-new player ─────────────────────────────────── */
    {
      const page = await freshPage(browser);
      page.on("console", (m) => {
        // The signaling server is not part of this test; its polling
        // failures are expected noise when it is not running.
        if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text()))
          consoleErrors.push(m.text());
      });

      check("new player is asked for a name", await nameGateVisible(page));

      await typeName(page, "Astrid");
      check("gate closes after submitting", !(await nameGateVisible(page)));
      check("name appears in the header", (await chipName(page)) === "Astrid",
        String(await chipName(page)));

      const stored = await storageState(page);
      check("name is mirrored locally", stored.name === "Astrid", String(stored.name));

      /* ── 2. Same player reloads ────────────────────────────── */
      await page.reload({ waitUntil: "networkidle2" });
      await sleep(600);
      check("reload does not re-ask for a name", !(await nameGateVisible(page)));
      check("reload keeps the same name", (await chipName(page)) === "Astrid",
        String(await chipName(page)));

      const afterReload = await storageState(page);
      // With no Supabase configured there is nothing to sync to, so
      // the retry marker must not be left set. With Supabase
      // configured it must have been drained by the write.
      check("no stale unsynced marker", afterReload.pending === null,
        String(afterReload.pending));

      await page.close();
    }

    /* ── 3. Existing player from before Supabase ─────────────── */
    {
      const page = await freshPage(browser, "LegacyPlayer");
      await sleep(600);
      check("pre-existing local name is not re-asked", !(await nameGateVisible(page)));
      check("pre-existing local name is kept", (await chipName(page)) === "LegacyPlayer",
        String(await chipName(page)));

      // Reload: whichever store is authoritative, the answer must
      // not change between visits.
      await page.reload({ waitUntil: "networkidle2" });
      await sleep(600);
      check("migrated name is stable across reloads",
        (await chipName(page)) === "LegacyPlayer", String(await chipName(page)));
      await page.close();
    }

    /* ── 4. Editing the name ─────────────────────────────────── */
    {
      const page = await freshPage(browser, "BeforeEdit");
      await sleep(600);
      await page.click("[aria-label='Edit your name']");
      const input = await page.waitForSelector("[role='dialog'] input[type='text']", {
        timeout: 10_000,
      });
      // Clear the pre-filled value before typing the new one.
      await input!.click({ count: 3 });
      await input!.type("AfterEdit");
      await page.click("[role='dialog'] button[type='submit']");
      await sleep(400);
      check("edited name applies immediately", (await chipName(page)) === "AfterEdit",
        String(await chipName(page)));

      await page.reload({ waitUntil: "networkidle2" });
      await sleep(600);
      check("edited name survives a reload", (await chipName(page)) === "AfterEdit",
        String(await chipName(page)));
      await page.close();
    }

    /* ── 5. Nothing camera-related is persisted ──────────────── */
    {
      const page = await freshPage(browser, "PrivacyCheck");
      await sleep(600);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      const suspicious = keys.filter((k) =>
        /face|landmark|frame|video|webcam|biometric|photo|image/i.test(k),
      );
      check("no face/video data in browser storage", suspicious.length === 0,
        suspicious.join(", "));
      await page.close();
    }

    check("no unexpected console errors", consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
