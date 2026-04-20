import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

(async () => {
  console.log("\n=== Agency Task Creation E2E Test ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
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

  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("ERR_BLOCKED") && !text.includes("favicon")) {
        consoleErrors.push(text);
      }
    }
  });
  page.on("response", (resp) => {
    if (resp.status() >= 500) {
      serverErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  // 1. Navigate to playground
  console.log("1. Navigating to playground...");
  await page.goto("https://agency.recoder.xyz/playground", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  console.log(`   URL: ${page.url()}`);
  await page.screenshot({ path: "agency-task-1-playground.png", fullPage: true });

  // 2. Find the text input and type a prompt
  console.log("2. Looking for prompt input...");
  const textarea = page.locator('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]').first();
  const hasInput = await textarea.isVisible({ timeout: 10000 }).catch(() => false);

  if (!hasInput) {
    console.log("   No input found. Taking screenshot and checking DOM...");
    const allInputs = await page.locator('textarea, input, [contenteditable]').count();
    console.log(`   Total input-like elements: ${allInputs}`);
    await page.screenshot({ path: "agency-task-2-no-input.png", fullPage: true });
  } else {
    console.log("   Found input. Typing prompt...");
    await textarea.click();
    await textarea.fill("Write a blog post about AI agents");
    await page.screenshot({ path: "agency-task-2-typed.png", fullPage: true });

    // 3. Find and click the run/submit button
    console.log("3. Looking for submit button...");
    // Try different possible button selectors
    const submitBtn = page.locator('button[type="submit"], button:has-text("Run"), button:has-text("Send"), button:has-text("Submit"), button:has(svg)').last();
    const hasBtnVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtnVisible) {
      console.log("   Found submit button. Clicking...");

      // Listen for the server action response
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes("agency.recoder.xyz") && resp.request().method() === "POST",
        { timeout: 30000 }
      ).catch(() => null);

      await submitBtn.click();
      await page.screenshot({ path: "agency-task-3-clicked.png", fullPage: true });

      // 4. Wait for response
      console.log("4. Waiting for task creation response...");
      const actionResp = await responsePromise;

      if (actionResp) {
        console.log(`   Response: ${actionResp.status()} ${actionResp.url()}`);
        if (actionResp.status() >= 500) {
          const body = await actionResp.text().catch(() => "");
          console.log(`   ERROR body: ${body.substring(0, 500)}`);
        }
      } else {
        console.log("   No POST response captured in 30s");
      }

      // Wait a bit for any async errors
      await page.waitForTimeout(5000);
      await page.screenshot({ path: "agency-task-4-result.png", fullPage: true });
    } else {
      console.log("   No submit button found.");
      // Check what buttons exist
      const buttons = await page.locator('button').all();
      for (const btn of buttons.slice(0, 10)) {
        const text = await btn.textContent().catch(() => "");
        const ariaLabel = await btn.getAttribute("aria-label").catch(() => "");
        if (text.trim() || ariaLabel) {
          console.log(`   Button: "${text.trim()}" aria="${ariaLabel}"`);
        }
      }
      await page.screenshot({ path: "agency-task-3-buttons.png", fullPage: true });
    }
  }

  // 5. Also try the workspace editor
  console.log("\n5. Checking workspace editor...");
  await page.goto("https://agency.recoder.xyz/workspaces", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  // Click on the "Untitled" workspace
  const wsLink = page.locator('a:has-text("Untitled"), [class*="workspace"]:has-text("Untitled")').first();
  const hasWs = await wsLink.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasWs) {
    console.log("   Found 'Untitled' workspace, clicking...");
    await wsLink.click();
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    console.log(`   Landed on: ${page.url()}`);
    await page.screenshot({ path: "agency-task-5-workspace.png", fullPage: true });
  } else {
    console.log("   No workspace link found");
    await page.screenshot({ path: "agency-task-5-workspaces-list.png", fullPage: true });
  }

  await browser.close();

  // Summary
  console.log("\n=== RESULTS ===");
  console.log(`Server errors (5xx): ${serverErrors.length}`);
  for (const e of serverErrors.slice(0, 10)) {
    console.log(`  ${e}`);
  }
  console.log(`Console errors: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log(`  ${e.substring(0, 200)}`);
  }
})();
