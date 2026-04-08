import { chromium } from "playwright";

const TIMEOUT = 30000;
const results = [];

function log(platform, status, detail) {
  const entry = { platform, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  const icon = status === "PASS" ? "+" : status === "FAIL" ? "x" : "~";
  console.log(`[${icon}] ${platform}: ${detail}`);
}

async function testPM(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  try {
    // 1. Landing / redirect
    const response = await page.goto("https://pm.recoder.xyz", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const status = response?.status();
    const url = page.url();

    if (status && status < 500) {
      log("PM", "PASS", `Loaded (HTTP ${status}), landed on: ${url}`);
    } else {
      log("PM", "FAIL", `HTTP ${status} on load`);
    }

    // 2. Check for crash indicators
    const body = await page.textContent("body").catch(() => "");
    if (body.includes("MODULE_NOT_FOUND") || body.includes("Internal Server Error") || body.includes("Application error")) {
      log("PM", "FAIL", `Crash indicator in page body: ${body.substring(0, 200)}`);
    } else {
      log("PM", "PASS", "No crash indicators in page body");
    }

    // 3. Check if login/auth page renders
    const hasLoginForm = await page.locator('input[type="email"], input[name="email"], button:has-text("Sign"), button:has-text("Log")').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasLoginForm) {
      log("PM", "PASS", "Auth/login form renders correctly");
    } else {
      log("PM", "WARN", "No login form found — may be expected if redirecting elsewhere");
    }

    // 4. Screenshot
    await page.screenshot({ path: "pm-e2e.png", fullPage: true });
    log("PM", "PASS", "Screenshot saved: pm-e2e.png");

    // 5. Console errors
    const realErrors = errors.filter(
      (e) => !e.includes("ERR_BLOCKED") && !e.includes("SES") && !e.includes("extension") && !e.includes("favicon")
    );
    if (realErrors.length > 0) {
      log("PM", "WARN", `${realErrors.length} console errors: ${realErrors.slice(0, 3).join(" | ")}`);
    } else {
      log("PM", "PASS", "Zero console errors");
    }
  } catch (err) {
    log("PM", "FAIL", `Exception: ${err.message}`);
    await page.screenshot({ path: "pm-e2e-error.png" }).catch(() => {});
  } finally {
    await context.close();
  }
}

async function testAgency(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const errors = [];
  const networkErrors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("response", (resp) => {
    if (resp.status() >= 500) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  try {
    // 1. Landing page
    const response = await page.goto("https://agency.recoder.xyz", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const status = response?.status();
    const url = page.url();

    if (status && status < 500) {
      log("Agency", "PASS", `Loaded (HTTP ${status}), landed on: ${url}`);
    } else {
      log("Agency", "FAIL", `HTTP ${status} on load`);
    }

    // 2. Check for Giselle UI elements
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const body = await page.textContent("body").catch(() => "");
    if (body.includes("Application error") || body.includes("Internal Server Error")) {
      log("Agency", "FAIL", `App error in body: ${body.substring(0, 200)}`);
    } else {
      log("Agency", "PASS", "No crash indicators in page body");
    }

    // 3. Check login page renders
    const hasAuth = await page.locator('button:has-text("Sign"), button:has-text("Log"), button:has-text("GitHub"), input[type="email"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasAuth) {
      log("Agency", "PASS", "Auth UI renders correctly");
    } else {
      log("Agency", "WARN", "No auth UI found — checking page content");
      const title = await page.title();
      log("Agency", "WARN", `Page title: "${title}"`);
    }

    // 4. Screenshot
    await page.screenshot({ path: "agency-e2e.png", fullPage: true });
    log("Agency", "PASS", "Screenshot saved: agency-e2e.png");

    // 5. Try playground (unauthenticated — expect redirect or 401)
    const playgroundResp = await page.goto("https://agency.recoder.xyz/playground", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const pgStatus = playgroundResp?.status();
    const pgUrl = page.url();
    log("Agency", pgStatus < 500 ? "PASS" : "FAIL", `Playground: HTTP ${pgStatus}, redirected to: ${pgUrl}`);
    await page.screenshot({ path: "agency-playground-e2e.png", fullPage: true });

    // 6. Test the API route for task creation (unauthenticated)
    const apiResp = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/apps/test-app/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "test" }),
        });
        return { status: r.status, body: await r.text().catch(() => "") };
      } catch (e) {
        return { status: 0, body: e.message };
      }
    });
    if (apiResp.status === 401 || apiResp.status === 403 || apiResp.status === 404) {
      log("Agency", "PASS", `Task API returns ${apiResp.status} for unauth (expected)`);
    } else if (apiResp.status === 500) {
      log("Agency", "FAIL", `Task API returns 500: ${apiResp.body.substring(0, 200)}`);
    } else {
      log("Agency", "WARN", `Task API returns ${apiResp.status}: ${apiResp.body.substring(0, 200)}`);
    }

    // 7. Console/network errors
    const realErrors = errors.filter(
      (e) => !e.includes("ERR_BLOCKED") && !e.includes("SES") && !e.includes("extension") && !e.includes("favicon")
    );
    if (realErrors.length > 0) {
      log("Agency", "WARN", `${realErrors.length} console errors: ${realErrors.slice(0, 3).join(" | ")}`);
    } else {
      log("Agency", "PASS", "Zero console errors");
    }

    if (networkErrors.length > 0) {
      log("Agency", "WARN", `${networkErrors.length} 5xx responses: ${networkErrors.slice(0, 3).join(" | ")}`);
    } else {
      log("Agency", "PASS", "Zero 5xx network responses");
    }
  } catch (err) {
    log("Agency", "FAIL", `Exception: ${err.message}`);
    await page.screenshot({ path: "agency-e2e-error.png" }).catch(() => {});
  } finally {
    await context.close();
  }
}

async function testAgents(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const errors = [];
  const networkErrors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (resp) => {
    if (resp.status() >= 500) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  try {
    const response = await page.goto("https://agents.recoder.xyz", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const status = response?.status();
    const url = page.url();

    if (status && status < 500) {
      log("Agents", "PASS", `Loaded (HTTP ${status}), landed on: ${url}`);
    } else {
      log("Agents", "FAIL", `HTTP ${status} on load`);
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: "agents-e2e.png", fullPage: true });
    log("Agents", "PASS", "Screenshot saved: agents-e2e.png");

    if (networkErrors.length > 0) {
      log("Agents", "WARN", `${networkErrors.length} 5xx: ${networkErrors.slice(0, 5).join(" | ")}`);
    } else {
      log("Agents", "PASS", "Zero 5xx network responses");
    }
  } catch (err) {
    log("Agents", "FAIL", `Exception: ${err.message}`);
  } finally {
    await context.close();
  }
}

async function testWeb(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const networkErrors = [];
  page.on("response", (resp) => {
    if (resp.status() >= 500) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  try {
    const response = await page.goto("https://web.recoder.xyz", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const status = response?.status();
    log("Web", status < 500 ? "PASS" : "FAIL", `Loaded (HTTP ${status}), URL: ${page.url()}`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: "web-e2e.png", fullPage: true });
    log("Web", "PASS", "Screenshot saved: web-e2e.png");

    if (networkErrors.length > 0) {
      log("Web", "WARN", `${networkErrors.length} 5xx: ${networkErrors.slice(0, 5).join(" | ")}`);
    } else {
      log("Web", "PASS", "Zero 5xx network responses");
    }
  } catch (err) {
    log("Web", "FAIL", `Exception: ${err.message}`);
  } finally {
    await context.close();
  }
}

async function testMainSite(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    const response = await page.goto("https://recoder.xyz", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    const status = response?.status();
    log("recoder.xyz", status < 500 ? "PASS" : "FAIL", `Loaded (HTTP ${status}), URL: ${page.url()}`);
    await page.screenshot({ path: "main-e2e.png", fullPage: true });
    log("recoder.xyz", "PASS", "Screenshot saved: main-e2e.png");
  } catch (err) {
    log("recoder.xyz", "FAIL", `Exception: ${err.message}`);
  } finally {
    await context.close();
  }
}

// Main
(async () => {
  console.log("\n=== Recoder Platform E2E Check ===\n");
  const browser = await chromium.launch({ headless: true });

  await testPM(browser);
  console.log("");
  await testAgency(browser);
  console.log("");
  await testAgents(browser);
  console.log("");
  await testWeb(browser);
  console.log("");
  await testMainSite(browser);

  await browser.close();

  // Summary
  console.log("\n=== SUMMARY ===\n");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  console.log(`PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}`);
  console.log("");

  if (fail > 0) {
    console.log("FAILURES:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  [x] ${r.platform}: ${r.detail}`));
  }
  if (warn > 0) {
    console.log("\nWARNINGS:");
    results.filter((r) => r.status === "WARN").forEach((r) => console.log(`  [~] ${r.platform}: ${r.detail}`));
  }
})();
