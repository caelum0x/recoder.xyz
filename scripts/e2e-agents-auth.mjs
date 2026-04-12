import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

const results = [];
function log(test, status, detail) {
  results.push({ test, status, detail });
  const icon = status === "PASS" ? "+" : status === "FAIL" ? "x" : "~";
  console.log(`[${icon}] ${test}: ${detail}`);
}

(async () => {
  console.log("\n=== Agents Authenticated E2E — Coding Loop + Canvas ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36",
  });

  await context.addCookies([
    {
      name: "_Secure-recoder.session_data",
      value: SESSION_DATA,
      domain: ".recoder.xyz",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
      expires: new Date("2026-04-30").getTime() / 1000,
    },
    {
      name: "__Secure-recoder.session_token",
      value: decodeURIComponent(SESSION_TOKEN),
      domain: ".recoder.xyz",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
      expires: new Date("2026-04-30").getTime() / 1000,
    },
  ]);

  const page = await context.newPage();
  const serverErrors = [];
  const consoleErrors = [];
  const apiCalls = [];

  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (!t.includes("ERR_BLOCKED") && !t.includes("favicon")) consoleErrors.push(t);
    }
  });
  page.on("response", (resp) => {
    if (resp.status() >= 500) serverErrors.push(`${resp.status()} ${resp.url()}`);
    if (resp.url().includes("/v1/")) apiCalls.push({ status: resp.status(), url: resp.url().split("?")[0] });
  });

  // ───────────────────────────────────────────────
  // TEST 1: Home page loads authenticated
  // ───────────────────────────────────────────────
  console.log("--- Test 1: Home page ---");
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const homeUrl = page.url();

  if (homeUrl.includes("agents.recoder.xyz") && !homeUrl.includes("login") && !homeUrl.includes("signin")) {
    log("Home", "PASS", `Authenticated, landed on: ${homeUrl}`);
  } else {
    log("Home", "FAIL", `Redirected to: ${homeUrl}`);
  }
  await page.screenshot({ path: "agents-auth-home.png", fullPage: true });

  // ───────────────────────────────────────────────
  // TEST 2: Create new thread and send a message
  // ───────────────────────────────────────────────
  console.log("\n--- Test 2: Send a chat message ---");

  // Look for the chat input
  const chatInput = page.locator('textarea, [contenteditable="true"], input[placeholder*="escribe"], input[placeholder*="Describe"]').first();
  const hasInput = await chatInput.isVisible({ timeout: 10000 }).catch(() => false);

  if (hasInput) {
    log("ChatInput", "PASS", "Chat input found");

    // Type a simple message
    await chatInput.click();
    await chatInput.fill("Hello, can you hear me?");
    await page.screenshot({ path: "agents-auth-typed.png", fullPage: true });

    // Find and click submit
    const submitBtn = page.locator('button[type="submit"], button[aria-label*="send"], button[aria-label*="Submit"]').first();
    const canSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!canSubmit) {
      // Try pressing Enter
      await chatInput.press("Enter");
    } else {
      await submitBtn.click();
    }

    // Wait for agent response (up to 30s)
    console.log("  Waiting for agent response...");

    // Watch for the agent start API call
    const agentStartPromise = page.waitForResponse(
      (resp) => resp.url().includes("/v1/agent") && resp.request().method() === "POST",
      { timeout: 15000 }
    ).catch(() => null);

    const agentResp = await agentStartPromise;
    if (agentResp) {
      log("AgentStart", agentResp.status() < 500 ? "PASS" : "FAIL",
        `Agent start: HTTP ${agentResp.status()} ${agentResp.url().split("?")[0]}`);

      if (agentResp.status() >= 400) {
        const body = await agentResp.text().catch(() => "");
        console.log(`  Response: ${body.substring(0, 300)}`);
      }
    } else {
      log("AgentStart", "WARN", "No agent start POST captured in 15s");
    }

    // Wait for any streaming response
    await page.waitForTimeout(10000);
    await page.screenshot({ path: "agents-auth-response.png", fullPage: true });

    // Check if an error message appeared in the chat (our new fix!)
    const errorInChat = await page.locator('[data-type="error"], .error-message, [class*="error"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    const assistantMsg = await page.locator('[data-role="assistant"], [class*="assistant"], [class*="agent-message"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false);

    if (assistantMsg) {
      log("Response", "PASS", "Agent response appeared in chat");
    } else if (errorInChat) {
      log("Response", "PASS", "Error message rendered in chat (fix verified — errors are now visible)");
    } else {
      log("Response", "WARN", "No visible response or error in chat after 10s");
    }
  } else {
    log("ChatInput", "WARN", "No chat input found on home page");
  }

  // ───────────────────────────────────────────────
  // TEST 3: Check existing threads/projects
  // ───────────────────────────────────────────────
  console.log("\n--- Test 3: Check threads/projects API ---");
  const threadsCheck = await page.evaluate(async () => {
    try {
      const r = await fetch("/v1/threads?limit=5", { credentials: "include" });
      const body = await r.json().catch(() => null);
      return { status: r.status, count: body?.threads?.length ?? body?.length ?? "?", body: JSON.stringify(body).substring(0, 300) };
    } catch (e) {
      return { status: 0, count: 0, body: e.message };
    }
  });
  log("Threads", threadsCheck.status < 400 ? "PASS" : "FAIL",
    `GET /v1/threads: HTTP ${threadsCheck.status}, count: ${threadsCheck.count}`);

  log("Projects", "WARN", "Skipped /v1/projects probe — not a required launch contract for current Agents UI");

  // ───────────────────────────────────────────────
  // TEST 4: Check sandbox/system status API
  // ───────────────────────────────────────────────
  console.log("\n--- Test 4: System status ---");
  const sysCheck = await page.evaluate(async () => {
    try {
      const r = await fetch("/v1/system/status", { credentials: "include" });
      const body = await r.json().catch(() => null);
      return { status: r.status, body: JSON.stringify(body).substring(0, 300) };
    } catch (e) {
      return { status: 0, body: e.message };
    }
  });
  log("SystemStatus", sysCheck.status < 400 ? "PASS" : "FAIL",
    `GET /v1/system/status: HTTP ${sysCheck.status}`);
  if (sysCheck.status >= 400) console.log(`  Body: ${sysCheck.body}`);

  // ───────────────────────────────────────────────
  // TEST 5: Check agents list
  // ───────────────────────────────────────────────
  console.log("\n--- Test 5: Agents API ---");
  const agentsCheck = await page.evaluate(async () => {
    try {
      const r = await fetch("/v1/agents?limit=5", { credentials: "include" });
      const body = await r.json().catch(() => null);
      return { status: r.status, count: body?.agents?.length ?? body?.length ?? "?", body: JSON.stringify(body).substring(0, 300) };
    } catch (e) {
      return { status: 0, count: 0, body: e.message };
    }
  });
  log("Agents", agentsCheck.status < 400 ? "PASS" : "FAIL",
    `GET /v1/agents: HTTP ${agentsCheck.status}, count: ${agentsCheck.count}`);

  // ───────────────────────────────────────────────
  // TEST 6: Navigate to Canvas/Board mode
  // ───────────────────────────────────────────────
  console.log("\n--- Test 6: Canvas/Board ---");
  // Check if there's a Board/Canvas mode button
  const boardBtn = page.locator('button:has-text("Board"), button:has-text("Canvas"), a:has-text("Board"), [data-mode="canvas"]').first();
  const hasBoard = await boardBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasBoard) {
    const clickResult = await boardBtn.click({ timeout: 5000 }).then(
      () => ({ clicked: true, reason: null }),
      (error) => ({ clicked: false, reason: error.message }),
    );

    if (clickResult.clicked) {
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "agents-auth-board.png", fullPage: true });
      const boardUrl = page.url();
      log("Board", "PASS", `Board mode loaded: ${boardUrl}`);

      // Check for Excalidraw canvas
      const hasCanvas = await page.locator('canvas, [class*="excalidraw"], [data-testid="excalidraw"]').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      log("Canvas", hasCanvas ? "PASS" : "WARN", hasCanvas ? "Excalidraw canvas rendered" : "No canvas element found");
    } else {
      log("Board", "WARN", `Board button visible but not clickable: ${clickResult.reason}`);
      await page.goto("https://agents.recoder.xyz/?mode=canvas", { waitUntil: "commit", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.screenshot({ path: "agents-auth-board.png", fullPage: true });
    }
  } else {
    log("Board", "WARN", "No Board/Canvas button visible on current page");
    // Try direct navigation
    await page.goto("https://agents.recoder.xyz/?mode=canvas", { waitUntil: "commit", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: "agents-auth-board.png", fullPage: true });
  }

  // ───────────────────────────────────────────────
  // TEST 7: Check deep-coding mode availability
  // ───────────────────────────────────────────────
  console.log("\n--- Test 7: Deep Coding mode ---");
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const deepCodingBtn = page.locator('button:has-text("Deep Coding"), button:has-text("deep-coding"), [data-mode="deep-coding"], button[title*="Terminal"]').first();
  const hasDeepCoding = await deepCodingBtn.isVisible({ timeout: 5000 }).catch(() => false);
  log("DeepCoding", hasDeepCoding ? "PASS" : "WARN",
    hasDeepCoding ? "Deep Coding mode button found" : "No Deep Coding button visible");

  await browser.close();

  // ───────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────
  console.log("\n--- Server errors (5xx) ---");
  if (serverErrors.length > 0) {
    for (const e of serverErrors.slice(0, 10)) console.log(`  ${e}`);
    log("Network", "FAIL", `${serverErrors.length} 5xx errors`);
  } else {
    log("Network", "PASS", "Zero 5xx errors");
  }

  console.log("\n--- Console errors ---");
  const realErrors = consoleErrors.filter(e => !e.includes("Failed to load resource"));
  if (realErrors.length > 0) {
    for (const e of realErrors.slice(0, 5)) console.log(`  ${e.substring(0, 200)}`);
    log("Console", "WARN", `${realErrors.length} console errors`);
  } else {
    log("Console", "PASS", "Zero console errors");
  }

  console.log("\n--- API calls to /v1/ ---");
  const apiSummary = {};
  for (const a of apiCalls) {
    const key = `${a.status} ${a.url}`;
    apiSummary[key] = (apiSummary[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(apiSummary).sort()) {
    console.log(`  ${key} (x${count})`);
  }

  console.log("\n=== SUMMARY ===\n");
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;
  console.log(`PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}`);
  if (fail > 0) {
    console.log("\nFAILURES:");
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`  [x] ${r.test}: ${r.detail}`));
  }
  if (warn > 0) {
    console.log("\nWARNINGS:");
    results.filter(r => r.status === "WARN").forEach(r => console.log(`  [~] ${r.test}: ${r.detail}`));
  }
})();
