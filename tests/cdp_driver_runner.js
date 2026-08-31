"use strict";
// Headless browser driver for the *_e2e.js suite. Uses the Playwright chromium
// installed under %LOCALAPPDATA%\\ms-playwright (via the worker's dependency)
// and evaluates each test file inside the page, then reports __msOk/__msChecks
// as a single JSON line so tests\\run_all.ps1 can parse it.
// A hard watchdog force-exits this process so a stuck page can never stall
// tests\\run_all.ps1.

const fs = require("fs");

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const TestFile = arg("-test-file", "");
const Url = arg("-url", "http://127.0.0.1:8931/index.html");
const NavDelayMs = parseInt(arg("-nav-delay-ms", "4500"), 10);
const WindowSize = arg("-window-size", "1400,900");
const [W, H] = WindowSize.split(",").map(n => parseInt(n, 10));

function report(result) {
  try { process.stdout.write(JSON.stringify(result)); } catch (e) { /* noop */ }
}

const watchdog = setTimeout(function () {
  report({ ok: false, checks: [{ name: "driver", ok: false, detail: "watchdog timeout" }] });
  process.exit(1);
}, 230000);
watchdog.unref();

let chromium = null;
try {
  chromium = require("../market-scan/worker/node_modules/playwright-core");
} catch (e) {
  chromium = require("playwright-core");
}
const { chromium: pw } = chromium;

(async () => {
  if (!TestFile || !fs.existsSync(TestFile)) {
    report({ ok: false, checks: [{ name: "driver", ok: false, detail: "test file not found: " + TestFile }] });
    process.exit(1);
  }
  const src = fs.readFileSync(TestFile, "utf8");
  let browser = null;
  try {
    browser = await pw.launch({ headless: true });
  } catch (e) {
    try { browser = await pw.launch({ headless: true, channel: "chrome" }); }
    catch (e2) {
      report({ ok: false, checks: [{ name: "driver", ok: false, detail: "launch failed: " + e2.message }] });
      process.exit(1);
    }
  }
  let context = null;
  let page = null;
  try {
    context = await browser.newContext({ viewport: { width: W, height: H } });
    page = await context.newPage();
    page.on("dialog", async d => { try { await d.accept(); } catch (e) { /* noop */ } });
    await page.goto(Url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(NavDelayMs);

    await Promise.race([
      page.evaluate(src).catch(() => {}),
      new Promise(r => setTimeout(r, 190000))
    ]);

    let result = null;
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate(() => ({
        ok: !!(window.__msOk),
        checks: Array.isArray(window.__msChecks) ? window.__msChecks : [],
        done: !!(window.__msDone),
        log: Array.isArray(window.__msLog) ? window.__msLog.slice(-6) : []
      }));
      if (r.ok || r.checks.length > 0) { result = r; break; }
      await page.waitForTimeout(250);
    }
    if (!result) {
      result = await page.evaluate(() => ({
        ok: !!(window.__msOk),
        checks: Array.isArray(window.__msChecks) ? window.__msChecks : [],
        done: !!(window.__msDone),
        log: Array.isArray(window.__msLog) ? window.__msLog.slice(-6) : []
      }));
    }
    if (result.checks.length === 0 && !result.done) {
      result.log = result.log || [];
      result.log.push("timeout waiting for __msDone");
    }
    report({ ok: !!result.ok && result.checks.length > 0, checks: result.checks || [], log: result.log || [] });
    process.exit(result.ok && result.checks.length > 0 ? 0 : 1);
  } catch (e) {
    report({ ok: false, checks: [{ name: "driver", ok: false, detail: "run failed: " + (e && e.message || e) }] });
    process.exit(1);
  }
})();