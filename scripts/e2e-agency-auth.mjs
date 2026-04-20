import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

const results = [];
function log(status, detail) {
  results.push({ status, detail });
  const icon = status === "PASS" ? "+" : status === "FAIL" ? "x" : "~";
  console.log(`[${icon}] ${detail}`);
}

(async () => {
  console.log("\n=== Agency Authenticated E2E Test ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 OPR/128.0.0.0",
  });

  // Set session cookies for recoder.xyz domain (Agency uses separate auth but let's try both)
  await context.addCookies([
    {
      name: "_Secure-recoder.session_data",
      value: SESSION_DATA,
      domain: ".recoder.xyz",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
      expires: new Date("2026-04-30T15:22:53.649Z").getTime() / 1000,
    },
    {
      name: "__Secure-recoder.session_token",
      value: decodeURIComponent(SESSION_TOKEN),
      domain: ".recoder.xyz",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
      expires: new Date("2026-04-30T15:22:53.649Z").getTime() / 1000,
    },
  ]);

  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];
  const apiResponses = [];

  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ url: page.url(), text: msg.text() });
  });
  page.on("response", (resp) => {
    const url = resp.url();
    if (resp.status() >= 400) {
      networkErrors.push({ status: resp.status(), url });
    }
    if (url.includes("/api/")) {
      apiResponses.push({ status: resp.status(), url });
    }
  });

  // 1. Try to reach Agency root (authenticated)
  console.log("--- Step 1: Navigate to agency.recoder.xyz ---");
  const resp = await page.goto("https://agency.recoder.xyz", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  const landUrl = page.url();
  console.log(`  Landed on: ${landUrl} (HTTP ${resp?.status()})`);

  if (landUrl.includes("/login")) {
    log("WARN", "Redirected to login — recoder.xyz session cookie NOT accepted by Agency (separate auth)");

    // Try to check if Agency has its own session cookie name
    const cookies = await context.cookies("https://agency.recoder.xyz");
    console.log(`  Agency cookies: ${cookies.map(c => c.name).join(", ") || "(none)"}`);
  } else {
    log("PASS", `Authenticated — landed on: ${landUrl}`);
  }

  await page.screenshot({ path: "agency-auth-home.png", fullPage: true });

  // 2. Try to navigate to workspaces / playground directly
  console.log("\n--- Step 2: Navigate to /workspaces ---");
  const wsResp = await page.goto("https://agency.recoder.xyz/workspaces", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  const wsUrl = page.url();
  console.log(`  Landed on: ${wsUrl} (HTTP ${wsResp?.status()})`);
  await page.screenshot({ path: "agency-auth-workspaces.png", fullPage: true });

  if (wsUrl.includes("/login")) {
    log("WARN", "Workspaces redirected to login — need Agency-specific auth");
  } else {
    log("PASS", `Workspaces page loaded: ${wsUrl}`);

    // Check for workspace list
    const workspaceItems = await page.locator('[data-testid="workspace-item"], a[href*="/workspace"], .workspace-card, [class*="workspace"]').count();
    log(workspaceItems > 0 ? "PASS" : "WARN", `Found ${workspaceItems} workspace elements`);
  }

  // 3. Try playground
  console.log("\n--- Step 3: Navigate to /playground ---");
  const pgResp = await page.goto("https://agency.recoder.xyz/playground", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  const pgUrl = page.url();
  console.log(`  Landed on: ${pgUrl} (HTTP ${pgResp?.status()})`);
  await page.screenshot({ path: "agency-auth-playground.png", fullPage: true });

  // 4. Check Agency's own auth API
  console.log("\n--- Step 4: Check Agency auth status ---");
  const authCheck = await page.evaluate(async () => {
    try {
      // Try Better Auth session endpoint
      const r = await fetch("/api/auth/get-session", {
        credentials: "include",
      });
      return { status: r.status, body: await r.text().catch(() => "") };
    } catch (e) {
      return { status: 0, body: e.message };
    }
  });
  console.log(`  Auth check: HTTP ${authCheck.status}`);
  if (authCheck.status === 200) {
    const authJson = JSON.parse(authCheck.body);
    const parsed = authJson?.session ? "has session" : authCheck.body.substring(0, 200);
    log("PASS", `Agency auth session active: ${parsed}`);
  } else {
    log("WARN", `Agency auth: HTTP ${authCheck.status} — ${authCheck.body.substring(0, 200)}`);
  }

  // 5. Check authenticated task history page
  console.log("\n--- Step 5: Check /tasks ---");
  const tasksResp = await page.goto("https://agency.recoder.xyz/tasks", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  const tasksUrl = page.url();
  console.log(`  Landed on: ${tasksUrl} (HTTP ${tasksResp?.status()})`);
  await page.screenshot({ path: "agency-auth-tasks.png", fullPage: true });
  if (tasksResp?.status() && tasksResp.status() < 500) {
    log("PASS", `Tasks page loaded: ${tasksUrl}`);
  } else {
    log("FAIL", `Tasks page failed: HTTP ${tasksResp?.status()}`);
  }

  // 6. Check authenticated team settings route
  console.log("\n--- Step 6: Check /settings/team ---");
  const settingsResp = await page.goto("https://agency.recoder.xyz/settings/team", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  const settingsUrl = page.url();
  console.log(`  Landed on: ${settingsUrl} (HTTP ${settingsResp?.status()})`);
  await page.screenshot({ path: "agency-auth-settings.png", fullPage: true });

  const bodyText = await page.textContent("body").catch(() => "");
  if ((settingsResp?.status() ?? 0) >= 500) {
    log("FAIL", `Settings page failed: HTTP ${settingsResp?.status()}`);
  } else if (bodyText.includes("Application error") || bodyText.includes("Internal Server Error")) {
    log("WARN", `Settings page has error text: ${bodyText.substring(0, 300)}`);
  } else {
    log("PASS", `Settings page loaded: ${settingsUrl}`);
  }

  // 7. Summary
  console.log("\n--- Network errors ---");
  const filtered5xx = networkErrors.filter(e => e.status >= 500);
  if (filtered5xx.length > 0) {
    for (const e of filtered5xx.slice(0, 10)) {
      console.log(`  ${e.status} ${e.url}`);
    }
    log("FAIL", `${filtered5xx.length} 5xx network errors`);
  } else {
    log("PASS", "Zero 5xx network errors");
  }

  console.log("\n--- API responses ---");
  for (const r of apiResponses.slice(0, 15)) {
    console.log(`  ${r.status} ${r.url}`);
  }

  console.log("\n--- Console errors ---");
  const realErrors = consoleErrors.filter(
    e => !e.text.includes("ERR_BLOCKED") && !e.text.includes("SES") && !e.text.includes("extension") && !e.text.includes("favicon")
  );
  if (realErrors.length > 0) {
    for (const e of realErrors.slice(0, 5)) {
      console.log(`  [${e.url}] ${e.text.substring(0, 200)}`);
    }
    log("WARN", `${realErrors.length} console errors`);
  } else {
    log("PASS", "Zero console errors");
  }

  await browser.close();

  // Final summary
  console.log("\n=== SUMMARY ===\n");
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;
  console.log(`PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}`);
  if (fail > 0) {
    console.log("\nFAILURES:");
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`  [x] ${r.detail}`));
  }
  if (warn > 0) {
    console.log("\nWARNINGS:");
    results.filter(r => r.status === "WARN").forEach(r => console.log(`  [~] ${r.detail}`));
  }
})();
