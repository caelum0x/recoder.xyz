import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

(async () => {
  console.log("\n=== Full Coding Loop + Preview + Multi-turn ===\n");
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

  // Dismiss announcement
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('announcement-store-v2', JSON.stringify({ state: { dismissedAnnouncements: ["memories"] }, version: 0 }));
  });
  await page.reload({ waitUntil: "commit", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  // ── Step 1: Create a new project ──
  console.log("STEP 1: Send coding request...");
  const input = page.locator('textarea').first();
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill("Build a simple page with a red heading that says 'Recoder Works' and a paragraph below");

  const startRespPromise = page.waitForResponse(
    r => r.url().includes("/agent") && r.request().method() === "POST" && r.status() > 0,
    { timeout: 20000 }
  ).catch(() => null);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click({ timeout: 5000 }).catch(() => input.press("Enter"));

  const startResp = await startRespPromise;
  console.log(`  Agent start: HTTP ${startResp?.status() ?? "no response"}`);

  // ── Step 2: Wait for agent to finish (up to 45s) ──
  console.log("\nSTEP 2: Waiting for agent response (45s)...");
  await page.waitForTimeout(45000);
  await page.screenshot({ path: "coding-loop-1-response.png", fullPage: true });

  // Check page content for signs the agent responded
  const bodyText = await page.textContent("body");
  const hasCodeResponse = bodyText.includes("create_file") || bodyText.includes("index.html") ||
    bodyText.includes("Recoder Works") || bodyText.includes("red") || bodyText.includes("<h1>");
  console.log(`  Agent coding response: ${hasCodeResponse ? "YES" : "NO"}`);

  // ── Step 3: Check sandbox preview ──
  console.log("\nSTEP 3: Check sandbox preview...");
  // Find the thread/project that was just created
  const threadUrl = page.url();
  console.log(`  Current URL: ${threadUrl}`);

  // Extract project ID from URL or page state
  const projectId = await page.evaluate(() => {
    // Try to get project from page state
    const state = document.querySelector('[data-project-id]')?.getAttribute('data-project-id');
    if (state) return state;
    // Try URL
    const match = window.location.pathname.match(/\/thread\/([^/]+)/);
    return match ? match[1] : null;
  });
  console.log(`  Project ID from page: ${projectId || "not found in DOM"}`);

  // Look for preview iframe or sandbox URL in the page
  const previewIframe = page.locator('iframe[src*="sandbox"], iframe[src*="preview"]').first();
  const hasPreview = await previewIframe.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Preview iframe visible: ${hasPreview}`);

  if (hasPreview) {
    const src = await previewIframe.getAttribute("src");
    console.log(`  Preview URL: ${src}`);
    await page.screenshot({ path: "coding-loop-2-preview.png", fullPage: true });
  }

  // ── Step 4: Send follow-up edit (multi-turn test) ──
  console.log("\nSTEP 4: Multi-turn edit...");
  const input2 = page.locator('textarea').first();
  if (await input2.isVisible({ timeout: 5000 }).catch(() => false)) {
    await input2.fill("Change the background to green and add a footer that says 'Built with AI'");

    const editRespPromise = page.waitForResponse(
      r => r.url().includes("/agent") && r.request().method() === "POST" && r.status() > 0,
      { timeout: 20000 }
    ).catch(() => null);

    await input2.press("Enter");
    const editResp = await editRespPromise;
    console.log(`  Follow-up agent start: HTTP ${editResp?.status() ?? "no response"}`);

    // Wait for second response
    await page.waitForTimeout(30000);
    await page.screenshot({ path: "coding-loop-3-multiturn.png", fullPage: true });

    const bodyText2 = await page.textContent("body");
    const hasEdit = bodyText2.includes("green") || bodyText2.includes("footer") || bodyText2.includes("Built with AI");
    console.log(`  Multi-turn edit response: ${hasEdit ? "YES" : "NO"}`);
  } else {
    console.log("  No textarea for follow-up");
  }

  await browser.close();
  console.log("\n=== Done ===");
})();
