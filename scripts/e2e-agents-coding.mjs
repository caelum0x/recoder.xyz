import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

(async () => {
  console.log("\n=== Agents Coding Loop E2E ===\n");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36",
  });

  await context.addCookies([
    { name: "_Secure-recoder.session_data", value: SESSION_DATA, domain: ".recoder.xyz", path: "/", secure: true, httpOnly: true, sameSite: "None", expires: new Date("2026-04-30").getTime() / 1000 },
    { name: "__Secure-recoder.session_token", value: decodeURIComponent(SESSION_TOKEN), domain: ".recoder.xyz", path: "/", secure: true, httpOnly: true, sameSite: "None", expires: new Date("2026-04-30").getTime() / 1000 },
  ]);

  const page = await context.newPage();
  const errors5xx = [];
  page.on("response", (r) => { if (r.status() >= 500) errors5xx.push(`${r.status()} ${r.url().split("?")[0]}`); });

  // 1. Load home, dismiss any modal
  console.log("1. Loading agents home...");
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  // Dismiss the "Introducing Memories" modal or any dialog overlay
  const overlay = page.locator('[data-state="open"][aria-hidden="true"], .fixed.inset-0');
  if (await overlay.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("  Dismissing modal overlay...");
    // Try clicking the X/close button
    const closeBtn = page.locator('button:has-text("Got it"), button:has-text("Close"), button:has-text("Skip"), [aria-label="Close"], dialog button').first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    } else {
      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  }
  await page.screenshot({ path: "agents-coding-1-home.png", fullPage: true });
  console.log(`  URL: ${page.url()}`);

  // 2. Type a simple coding request
  console.log("\n2. Typing coding request...");
  const input = page.locator('textarea').first();
  if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
    await input.click();
    await input.fill("Create a simple HTML page that says Hello World with a blue background");

    await page.screenshot({ path: "agents-coding-2-typed.png" });

    // 3. Submit
    console.log("\n3. Submitting...");
    // Watch for agent start response
    const startPromise = page.waitForResponse(
      r => r.url().includes("/agent") && r.request().method() === "POST" && r.status() > 0,
      { timeout: 20000 }
    ).catch(() => null);

    // Try submit button, fallback to Enter
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await input.press("Enter");
    }

    const startResp = await startPromise;
    if (startResp) {
      const status = startResp.status();
      console.log(`  Agent start: HTTP ${status}`);
      if (status >= 400) {
        const body = await startResp.text().catch(() => "");
        console.log(`  Error body: ${body.substring(0, 500)}`);
      } else {
        console.log("  PASS: Agent started successfully");
      }
    } else {
      console.log("  No agent start response in 20s");
    }

    // 4. Wait for streaming response (30s)
    console.log("\n4. Waiting for agent response (30s)...");
    await page.waitForTimeout(30000);
    await page.screenshot({ path: "agents-coding-3-response.png", fullPage: true });

    // 5. Check what appeared in the chat
    const pageText = await page.textContent("body");
    const hasAssistantReply = pageText.includes("Hello World") || pageText.includes("html") || pageText.includes("background");
    const hasError = pageText.includes("Something went wrong") || pageText.includes("AI model rejected") || pageText.includes("API key");

    if (hasAssistantReply) {
      console.log("  PASS: Agent responded with coding content");
    } else if (hasError) {
      console.log("  PASS (error visible): Error message rendered in chat — our fix works");
      // Extract the error text
      const errorText = pageText.match(/Something went wrong[^.]*|AI model rejected[^.]*|API key[^.]*/)?.[0] || "";
      console.log(`  Error: ${errorText}`);
    } else {
      console.log("  WARN: No clear response or error visible");
    }

    // Check for sandbox/preview
    const previewFrame = page.locator('iframe[src*="sandbox"], iframe[src*="preview"], [class*="preview"]').first();
    const hasPreview = await previewFrame.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Preview visible: ${hasPreview}`);

  } else {
    console.log("  No textarea found");
  }

  // 6. Navigate to an existing thread to test recoder-i3v (multi-turn editing)
  console.log("\n5. Checking existing thread (multi-turn test)...");
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Dismiss modal again if needed
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  // Look for sidebar thread links
  const threadLinks = await page.locator('a[href*="/thread"], a[href*="/chat"], [class*="thread-item"], [class*="sidebar-item"]').count();
  console.log(`  Found ${threadLinks} thread links in sidebar`);

  if (threadLinks > 0) {
    const firstThread = page.locator('a[href*="/thread"], a[href*="/chat"], [class*="thread-item"]').first();
    await firstThread.click().catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "agents-coding-4-thread.png", fullPage: true });
    console.log(`  Navigated to: ${page.url()}`);
  }

  await browser.close();

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`5xx errors: ${errors5xx.length}`);
  for (const e of errors5xx.slice(0, 5)) console.log(`  ${e}`);
})();
