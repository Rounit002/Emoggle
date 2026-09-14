/**
 * End-to-end check for the solo round.
 *
 * Drives a real browser with a fake camera through one solo round
 * and asserts the round actually ENDS: the countdown reaches zero,
 * the scorer stops, and the result screen appears with a score.
 *
 * The bug this guards against: the round-timer effect depended on
 * the whole object returned by `useStableScoreSampler`, which is a
 * new reference on every render. The sampler re-renders the
 * component every 100ms while collecting, so the 1-second interval
 * was torn down and recreated before it could ever fire — the
 * countdown never moved, the round never ended, and the expression
 * scorer kept running forever.
 *
 * Needs a dev/prod server on http://localhost:3000.
 * Run: npx tsx scripts/verify-solo-round.ts
 */
import puppeteer, { type Page } from "puppeteer-core";

// Puppeteer types page-level errors as `unknown`, because a page can reject
// with any value, not only an Error.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
/** Round length plus room for model warm-up on a cold profile. */
const ROUND_TIMEOUT_MS = 25_000;

let failed = 0;
const expect = (name: string, ok: boolean, extra: string) => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(46)}  ${extra}`);
  if (!ok) failed += 1;
};

/** Click the first button whose text contains `label`. */
async function clickByText(page: Page, label: string) {
  return page.evaluate((text: string) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    );
    if (!btn) return false;
    (btn as HTMLButtonElement).click();
    return true;
  }, label);
}

/** The visible round timer, e.g. "07s", or null when not shown. */
async function readTimer(page: Page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("span")).find((s) =>
      /^\d{2}s$/.test(s.textContent?.trim() ?? ""),
    );
    return el?.textContent?.trim() ?? null;
  });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      // A synthetic camera so the solo round can actually start
      // without a physical device. There is no face in the feed, so
      // the score is expected to be low — what matters here is that
      // the round ENDS.
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (err: unknown) => pageErrors.push(errorText(err)));
    await page.setViewport({ width: 1280, height: 900 });
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(BASE, ["camera", "microphone"]);

    await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30_000 });

    // Skip the name modal if it is showing.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("input[type='text']");
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Tester");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form?.requestSubmit();
    });
    await new Promise((r) => setTimeout(r, 1_000));

    await clickByText(page, "Play now");
    await page.waitForSelector("[role='dialog'][aria-label='Choose a game mode']", {
      timeout: 10_000,
    });
    const openedSolo = await clickByText(page, "Solo");
    expect("solo mode opened", openedSolo, openedSolo ? "from the mode picker" : "button not found");

    // Wait for the camera to come up and the start button to arm.
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => /start|scan/i.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled,
        ),
      { timeout: 25_000 },
    );

    const started = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => /start|scan/i.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled,
      );
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    });
    expect("round started", started, started ? "scan button clicked" : "no enabled start button");

    // Time the round from the moment it actually begins on screen,
    // not from the click. On a cold profile the face model compiles
    // on the main thread and can hold the click handler for several
    // seconds — that delays the start, not the round length, and
    // measuring from the click would blame the round for it.
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("span")).some((sp) =>
          /^\d{2}s$/.test(sp.textContent?.trim() ?? ""),
        ),
      { timeout: 30_000, polling: 100 },
    );
    const startedAt = Date.now();
    const firstTimer = await readTimer(page);

    // The countdown must actually move. Under the bug it stayed
    // pinned at its initial value forever.
    let moved = false;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      const now = await readTimer(page);
      if (now && firstTimer && now !== firstTimer) {
        moved = true;
        break;
      }
    }
    expect(
      "the countdown ticks down",
      moved,
      moved ? `moved off ${firstTimer}` : `stuck at ${firstTimer} for 10s`,
    );

    // The round must reach the result screen on its own.
    let ended = false;
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          return (
            /Ate that|Face card valid|Kinda cooked|Try again bestie|No face card/.test(text) &&
            /Play again|Next emoji|Try again/i.test(text)
          );
        },
        { timeout: ROUND_TIMEOUT_MS, polling: 500 },
      );
      ended = true;
    } catch {
      ended = false;
    }
    const elapsed = Date.now() - startedAt;
    expect(
      "the round ends on its own",
      ended,
      ended ? `results after ${(elapsed / 1000).toFixed(1)}s` : `still running after ${(elapsed / 1000).toFixed(1)}s`,
    );
    expect(
      "it ends at roughly the round length",
      ended && elapsed < 16_000,
      `${(elapsed / 1000).toFixed(1)}s`,
    );

    // A score must be rendered (0.0 is a valid outcome for a
    // faceless synthetic feed; "--" means nothing was produced).
    const scoreText = await page.evaluate(() => {
      const match = document.body.innerText.match(/(\d+\.\d)\s*\/?\s*10|\b(\d+\.\d)\b/);
      return match ? match[0] : null;
    });
    expect("a score is displayed", !!scoreText, scoreText ?? "no numeric score on screen");

    // With the round over, the expression scorer must stop. It only
    // runs while the phase is "playing", so a settled result screen
    // that stays settled is the observable signal.
    await new Promise((r) => setTimeout(r, 3_000));
    const stillResults = await page.evaluate(() =>
      /Ate that|Face card valid|Kinda cooked|Try again bestie|No face card/.test(document.body.innerText),
    );
    expect("the result screen stays put", stillResults, stillResults ? "scorer stopped" : "flipped back");

    // A second round must behave the same. Replaying used to be
    // where a stale "already finished" guard or a stale start time
    // would show up.
    const replayed = await clickByText(page, "New emoji");
    expect("a new emoji can be drawn", replayed, replayed ? "back to ready" : "button not found");
    await new Promise((r) => setTimeout(r, 500));
    const restarted = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => /start scan|try again/i.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled,
      );
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    });
    expect("a second round starts", restarted, restarted ? "scan button clicked" : "no start button");

    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("span")).some((sp) =>
          /^\d{2}s$/.test(sp.textContent?.trim() ?? ""),
        ),
      { timeout: 30_000, polling: 100 },
    );
    const secondStartedAt = Date.now();
    let secondEnded = false;
    try {
      await page.waitForFunction(
        () =>
          /Ate that|Face card valid|Kinda cooked|Try again bestie|No face card/.test(
            document.body.innerText,
          ),
        { timeout: ROUND_TIMEOUT_MS, polling: 500 },
      );
      secondEnded = true;
    } catch {
      secondEnded = false;
    }
    const secondElapsed = Date.now() - secondStartedAt;
    expect(
      "the second round also ends on its own",
      secondEnded && secondElapsed < 16_000,
      `${(secondElapsed / 1000).toFixed(1)}s`,
    );

    expect(
      "no uncaught page errors",
      pageErrors.length === 0,
      pageErrors.length ? pageErrors.slice(0, 2).join(" | ") : "none",
    );
  } finally {
    await browser.close();
  }

  console.log(failed === 0 ? "\nSolo round OK." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
