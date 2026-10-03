import assert from "node:assert/strict";
import puppeteer, { type Page } from "puppeteer-core";
import { mkdirSync } from "node:fs";
const base = process.env.VERIFY_BASE ?? "http://localhost:3000";
const faceSyncMode = process.env.VERIFY_PRIVATE_MODE === "facesync";
const output = new URL("../.verification/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
async function click(page: Page, text: string) {
  await page.waitForFunction(t => Array.from(document.querySelectorAll("button")).some(b => (b.getAttribute("aria-label") ?? b.textContent)?.trim() === t && !b.disabled), { timeout: 40000, polling: 100 }, text);
  await page.evaluate(t => { const b = Array.from(document.querySelectorAll("button")).find(b => (b.getAttribute("aria-label") ?? b.textContent)?.trim() === t && !b.disabled); b?.click(); }, text);
}
async function name(page: Page, value: string) {
  await page.waitForSelector('[aria-label="Choose a name"] input', { timeout: 15000 });
  await page.type('[aria-label="Choose a name"] input', value); await click(page, "Continue");
}
async function main() {
  mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const errors: string[] = [];
  try {
    const hostContext = await browser.createBrowserContext(), guestContext = await browser.createBrowserContext();
    await hostContext.overridePermissions(base, ["camera", "microphone"]); await guestContext.overridePermissions(base, ["camera", "microphone"]);
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    const trace: unknown[] = [];
    for (const p of [host, guest]) {
      p.on("pageerror", e => errors.push(String(e)));
      await p.setRequestInterception(true);
      p.on("request", request => {
        if (request.url().endsWith("/api/billing/checkout")) void request.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }, body: JSON.stringify({ checkoutUrl: "https://test.checkout.dodopayments.com/session/cks_ui_test" }) });
        else if (/face_landmarker|\.task(?:\?|$)|mediapipe.*wasm/.test(request.url())) void request.abort();
        else void request.continue();
      });
      const cdp = await p.createCDPSession(); await cdp.send("Network.enable");
      for (const direction of ["Network.webSocketFrameReceived", "Network.webSocketFrameSent"] as const) cdp.on(direction, event => {
        try { const data = event.response.payloadData; if (!data.startsWith("42")) return; const [kind, payload] = JSON.parse(data.slice(2));
          if (["round_state", "emoji_skip_request", "emoji_skip_state", "emoji_skip_respond", "match_result", "operation_error", "round_error"].includes(kind)) trace.push({ side:p===host?"host":"guest", direction, kind, phase:payload?.serverPhase, generation:payload?.generation, detail:payload?.detail, status:payload?.status, at:Date.now() });
        } catch { /* other websocket packets */ }
      });
    }
    await host.setViewport({ width: 1440, height: 1000 }); await guest.setViewport({ width: 390, height: 844, isMobile: true });
    await host.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await host.waitForSelector('a[href="/1v1"]');
    assert.equal(await host.$('[aria-modal="true"]'), null, "No popup on arrival");
    await host.goto(`${base}/1v1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await host.waitForSelector('#private-rounds');
    assert.equal(await host.$eval('#private-rounds', el => (el as HTMLInputElement).value), '3');
    assert.equal(await host.$$eval('input[name="private-game"]', nodes => nodes.length), 3);
    for(const width of [320,390,768,1440]) {
      await host.setViewport({width,height:1000});
      assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth), `No overflow at ${width}px`);
      await host.screenshot({path:`${output}/private-setup-${width}.png`,fullPage:true});
    }
    await host.focus('#private-rounds'); await host.keyboard.press('End');
    assert.equal(await host.$eval('#private-rounds', el => (el as HTMLInputElement).value), '5');
    await host.keyboard.press('ArrowLeft');
    assert.equal(await host.$eval('#private-rounds', el => (el as HTMLInputElement).value), '3');
    if(!faceSyncMode) await host.keyboard.press('Home');
    await host.click(`label:has(input[name="private-game"][value="${faceSyncMode?'facesync':'emoji'}"])`);
    assert.equal(new URL(host.url()).pathname,'/1v1');
    await click(host, "Create room"); await name(host, "HostTest");
    await host.waitForSelector('input[aria-label="Room code"]', { timeout: 30000 });
    const code = await host.$eval('input[aria-label="Room code"]', el => (el as HTMLInputElement).value);
    await host.screenshot({ path: `${output}/private-host.png` });
    await guest.goto(`${base}/1v1`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await guest.waitForSelector('[aria-label="Enter room code"]');
    await guest.type('[aria-label="Enter room code"]', code.toLowerCase());
    await click(guest, "Find room");
    await guest.waitForFunction(() => document.body.textContent?.includes("You’re invited!"), { timeout: 30000 });
    assert.equal(new URL(guest.url()).hash, "", "Invite fragment stripped");
    assert.equal(await guest.$('[aria-modal="true"]'), null, "Guest preview without name popup");
    await guest.screenshot({ path: `${output}/private-guest-mobile.png` });
    await click(guest, "Join 1v1"); await name(guest, "GuestTest"); await click(host, "Enter camera lobby");
    await click(host, "I'm ready"); await click(guest, "I'm ready");
    if(faceSyncMode) {
      for(let round=1;round<=3;round++) {
        const text=round===3?'Comparisons complete!':'Ready for next round';
        for(const p of [host,guest]) await p.waitForFunction(t=>document.body.textContent?.includes(t),{timeout:30000},text);
        assert.equal(await host.$('[aria-labelledby="support-title"]'),null,'Face Sync does not trigger scored-round support');
        if(round<3) {await click(host,'Ready for next round');await click(guest,'Ready for next round');}
      }
      assert.equal(await host.$('[data-round-result]'),null,'No competitive score card for Face Sync');
      await host.screenshot({path:`${output}/private-facesync-result.png`});
      assert.deepEqual(errors,[]);
      console.log('Private Face Sync passed: unified responsive setup, slider keyboard choices, invitation, cameras, three ready-gated comparisons, completion, no competitive points/support prompt.');
      return;
    }
    await host.bringToFront();
    await click(host, "Request emoji skip");
    try { await host.waitForSelector('[aria-labelledby="skip-title"]', { timeout: 5000 }); } catch (e) { console.log(JSON.stringify(trace)); console.log((await host.$eval("body", el => el.textContent))?.slice(-2500)); await host.screenshot({path:`${output}/private-failure.png`}); throw e; } await guest.waitForSelector('[aria-labelledby="skip-title"]', { timeout: 5000 });
    await click(host, "Agree to skip");
    assert.ok(await guest.$('[aria-labelledby="skip-title"]'), "One consent does not restart");
    await guest.evaluate(() => { const button = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Agree to skip"); if (!button) throw new Error("Missing guest consent"); button.click(); });
    await host.waitForFunction(() => !document.querySelector('[aria-labelledby="skip-title"]'), { timeout: 10000 });
    try { await host.waitForSelector('[data-round-result]', { timeout: 30000 }); } catch (e) { console.log(JSON.stringify(trace)); console.log((await host.$eval("body", el => el.textContent))?.slice(-1800)); await host.screenshot({path:`${output}/private-failure.png`}); throw e; }
    await host.bringToFront();
    try { await host.waitForSelector('[aria-labelledby="support-title"]', { timeout: 15000 }); } catch (e) { console.log(JSON.stringify(trace)); console.log(await host.evaluate(() => ({ hidden:document.hidden, record:localStorage.getItem("emoggle:support-prompt:v1"), dialogs:Array.from(document.querySelectorAll("[aria-modal]"), el=>el.outerHTML.slice(0,400)), body:document.body.textContent?.slice(-2000) }))); await host.screenshot({path:`${output}/private-failure.png`}); throw e; }
    await host.type('#support-amount', '1'); await click(host, "Continue to secure checkout");
    await host.waitForSelector('a[target="_blank"][href="https://test.checkout.dodopayments.com/session/cks_ui_test"]', { timeout: 10000 });
    assert.equal(new URL(host.url()).pathname, '/1v1', "Checkout preserves the game tab");
    await click(host, "Maybe later — let me play");
    assert.ok(await host.$('[data-round-result]'));
    await host.waitForFunction(() => document.body.textContent?.includes("Series draw!") || document.body.textContent?.includes("won the series!"), { timeout: 5000 });
    await host.screenshot({ path: `${output}/private-result.png` });
    assert.deepEqual(errors, []);
    console.log("Desktop/mobile UI passed: browsing, invite preview/name gate, cameras/readiness, both skip dialogs, restart, completed series, first-round support dismissal.");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
