import { chromium } from "playwright";

const SESSION_DATA = "eyJzZXNzaW9uIjp7InNlc3Npb24iOnsiaWQiOiI3ZDg1NjY2ZC01YzgzLTQwODQtYjlmOC1jNjYwYzNkZjMxNDMiLCJ1c2VySWQiOiIzOGVlMTNkMy03MjA5LTQ4MmQtOGEyYS00MDQ2YjdhMDA1OTMiLCJleHBpcmVzQXQiOiIyMDI2LTA0LTMwVDE1OjIyOjUzLjQ4NloiLCJ0b2tlbiI6IkpsSWVsQ0Q0Ym5CRUg3N1UyUnlTd2NQcnI0azB5VFFqIiwiaXBBZGRyZXNzIjoiOTQuNTUuMjM1LjY3IiwidXNlckFnZW50IjoiTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzE0NC4wLjAuMCBTYWZhcmkvNTM3LjM2IE9QUi8xMjguMC4wLjAiLCJkZXZpY2UiOm51bGwsImJyb3dzZXIiOm51bGwsIm9zIjpudWxsLCJsb2NhdGlvbiI6bnVsbCwiaXNBY3RpdmUiOnRydWUsImxhc3RBY3RpdmVBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg3WiIsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMzFUMTU6MjI6NTMuNDg2WiJ9LCJ1c2VyIjp7ImlkIjoiMzhlZTEzZDMtNzIwOS00ODJkLThhMmEtNDA0NmI3YTAwNTkzIiwiZW1haWwiOiJzdWJhc2lhcmhhbjNAZ21haWwuY29tIiwibmFtZSI6ImFyaGFuIHN1YmHFn8SxIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwidHdvRmFjdG9yRW5hYmxlZCI6ZmFsc2UsImNyZWF0ZWRBdCI6IjIwMjYtMDMtMTZUMTE6NTY6MzUuNzI1WiIsInVwZGF0ZWRBdCI6IjIwMjYtMDMtMTdUMjA6MDU6MjcuMjI5WiIsImxhc3RMb2dpbkF0IjpudWxsLCJpbWFnZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0phTDFUVjhfZ0lRdlBQSDZ5S3p2RjA4NG1vaTk4c1pVQjFCZVpvVjNNeFZxTFdxZz1zOTYtYyIsInBhc3N3b3JkIjpudWxsLCJhcGlLZXkiOm51bGwsInJlZmVycmFsQ29kZSI6bnVsbCwicmVmZXJyZWRCeUNvZGUiOm51bGwsInV0bVNvdXJjZSI6bnVsbCwidXRtTWVkaXVtIjpudWxsLCJ1dG1DYW1wYWlnbiI6bnVsbCwidXRtVGVybSI6bnVsbCwidXRtQ29udGVudCI6bnVsbCwiZmlyc3RUb3VjaFJlZmVycmVyIjpudWxsLCJmaXJzdFRvdWNoTGFuZGluZyI6bnVsbCwiYWNxdWlzaXRpb25Tb3VyY2UiOm51bGwsImJhY2t1cENvZGVzIjpudWxsLCJiYWNrdXBDb2Rlc1RlbXAiOm51bGwsImlzQWN0aXZlIjp0cnVlLCJvcmdhbml6YXRpb24iOm51bGwsInJlZnJlc2hUb2tlbiI6bnVsbCwicm9sZSI6InVzZXIiLCJzdWJzY3JpcHRpb24iOiJmcmVlIiwic3Vic2NyaXB0aW9uUGxhbiI6ImZyZWUiLCJzdWJzY3JpcHRpb25TdGF0dXMiOiJhY3RpdmUiLCJzdWJzY3JpcHRpb25JZCI6bnVsbCwic3Vic2NyaXB0aW9uRW5kRGF0ZSI6bnVsbCwic3Vic2NyaXB0aW9uQ2FuY2VsbGVkQXQiOm51bGwsImNhbmNlbFJlYXNvbiI6bnVsbCwiY2FuY2VsRmVlZGJhY2siOm51bGwsImhhc093bkFwaUtleSI6dHJ1ZSwib3BlblJvdXRlckFwaUtleSI6InNrLW9yLXYxLXRlc3QxMjMiLCJhcGlLZXlFbmNyeXB0ZWQiOm51bGwsImNsYXVkZUNvZGVUb2tlbiI6bnVsbCwibGFzdFBheW1lbnREYXRlIjpudWxsLCJsYXN0UGF5bWVudEFtb3VudCI6bnVsbCwicGF5bWVudFN0YXR1cyI6bnVsbCwicGxhbiI6bnVsbCwib25ib2FyZGluZ1N0ZXAiOiJjb21wbGV0ZWQiLCJvbmJvYXJkaW5nUHJvZmlsZSI6eyJwbGFuIjoiZnJlZSIsIndhbnRzQ2xpU2V0dXAiOmZhbHNlfSwib25ib2FyZGluZ0NvbXBsZXRlZEF0IjoiMjAyNi0wMy0xN1QyMDowNToyNy4yMjlaIiwicHJlZmVycmVkTW9kZWxzIjpbXSwidG90cFNlY3JldCI6bnVsbCwidG90cFNlY3JldFRlbXAiOm51bGwsInR3b0ZhY3RvckVuYWJsZWRBdCI6bnVsbCwidHdvRmFjdG9yU2V0dXBBdCI6bnVsbH19LCJleHBpcmVzQXQiOjE3Nzc1NjI1NzM0OTEsInNpZ25hdHVyZSI6ImRCSDVDRXhVNEJnYjhPV1MwLS11QnNXVVRYQl9qSkl1SE55bzQ2cnlJVFEifQ";
const SESSION_TOKEN = "JlIelCD4bnBEH77U2RySwcPrr4k0yTQj.q2B%2FYV88GEIroiWxkC6N%2BVwxZNVHulVGYRbu6IuI3Zc%3D";

(async () => {
  console.log("\n=== Agents Board + Deep Coding E2E ===\n");
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

  // Pre-dismiss the announcement modal via localStorage
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('announcement-store-v2', JSON.stringify({
      state: { dismissedAnnouncements: ["memories"] },
      version: 0
    }));
  });

  // Reload to apply
  await page.reload({ waitUntil: "commit", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: "agents-board-0-home-clean.png", fullPage: true });
  console.log("1. Home loaded with modal dismissed");

  // ── Test Board/Canvas mode ──
  console.log("\n2. Testing Board/Canvas mode...");
  const canvasMode = page.locator('[data-mode="canvas"], button:has-text("Canvas"), a:has-text("Canvas")').first();
  const hasCanvasMode = await canvasMode.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasCanvasMode) {
    await canvasMode.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "agents-board-1-clicked.png", fullPage: true });
    console.log(`  Canvas mode clicked. URL: ${page.url()}`);

    const createBoardOption = page.locator('[data-canvas-action]').first();
    const hasBoardOption = await createBoardOption.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBoardOption) {
      const boardLabel = (await createBoardOption.getAttribute('aria-label')) || 'canvas-option';
      await createBoardOption.click();
      await page.waitForTimeout(2000);
      console.log(`  Canvas starter selected: ${boardLabel}`);
    } else {
      console.log("  Canvas action grid did not appear");
    }

    await page.waitForURL(/\/projects\/.+\/thread\/.+/, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "agents-board-2-route.png", fullPage: true });

    // Check for canvas element (Excalidraw)
    const canvas = page.locator('canvas').first();
    const hasCanvas = await canvas.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  Canvas element: ${hasCanvas ? "VISIBLE" : "not found"}`);

    // Check for Excalidraw specific elements
    const excalidraw = page.locator('.excalidraw, [data-testid="excalidraw-container"], .excalidraw-container').first();
    const hasExcalidraw = await excalidraw.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Excalidraw container: ${hasExcalidraw ? "VISIBLE" : "not found"}`);

    if (hasCanvas) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 100, box.y + 100);
        await page.waitForTimeout(500);
        await page.screenshot({ path: "agents-board-3-canvas.png", fullPage: true });
        console.log("  Canvas interaction tested");
      }
    }
  } else {
    console.log("  No Canvas mode found. Checking all mode tabs...");
    const allButtons = await page.locator('button, a').allTextContents();
    const modeButtons = allButtons.filter(t => t.trim().length > 0 && t.trim().length < 30);
    console.log(`  Visible buttons: ${modeButtons.slice(0, 20).join(", ")}`);
  }

  // ── Test Deep Coding mode ──
  console.log("\n3. Testing Deep Coding mode...");
  // Go back to home
  await page.goto("https://agents.recoder.xyz/", { waitUntil: "commit", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const deepCodingTab = page.locator('button:has-text("Deep Coding"), [data-mode="deep-coding"]').first();
  const hasDeepTab = await deepCodingTab.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasDeepTab) {
    await deepCodingTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "agents-deepcoding-1-selected.png", fullPage: true });
    console.log("  Deep Coding tab selected");

    // Deep Coding opens a prompt dialog on the home surface. Dismiss it so the
    // smoke exercises the actual home-input submit path instead of the blocked
    // background textarea.
    const modeDialog = page.locator('[role="dialog"]').first();
    if (await modeDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeButton = modeDialog.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
      if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeButton.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(500);
    }

    // Type a coding request
    const input = page.locator('textarea').first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill("Create a simple counter app in React");

      // Intercept the agent start request to check if mode is sent
      const startPromise = page.waitForRequest(
        r => r.url().includes("/agent") && r.method() === "POST",
        { timeout: 15000 }
      ).catch(() => null);

      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
      } else {
        await input.press("Enter");
      }

      const startReq = await startPromise;
      if (startReq) {
        // Check if the request includes mode in FormData
        const postData = startReq.postData() || "";
        const hasMode = postData.includes("mode") || postData.includes("deep-coding") || postData.includes("deep_coding");
        console.log(`  Agent start request captured`);
        console.log(`  Mode field in request: ${hasMode ? "YES" : "NO"}`);
        console.log(`  POST data preview: ${postData.substring(0, 500)}`);

        // Wait for response
        const respPromise = page.waitForResponse(
          r => r.url().includes("/agent") && r.request().method() === "POST",
          { timeout: 15000 }
        ).catch(() => null);
        const resp = await respPromise;
        if (resp) {
          console.log(`  Response: HTTP ${resp.status()}`);
          if (resp.status() >= 400) {
            const body = await resp.text().catch(() => "");
            console.log(`  Error: ${body.substring(0, 300)}`);
          }
        }
      } else {
        console.log("  No agent start request captured");
      }

      await page.waitForTimeout(5000);
      await page.screenshot({ path: "agents-deepcoding-2-response.png", fullPage: true });
    }
  } else {
    console.log("  No Deep Coding tab found. Checking available modes...");
    const modeSelector = page.locator('[class*="mode"], [data-mode], [role="tab"]');
    const modeCount = await modeSelector.count();
    console.log(`  Found ${modeCount} mode-related elements`);

    // List all visible tab-like elements
    const tabs = await page.locator('button[role="tab"], [class*="tab"], nav button').allTextContents();
    console.log(`  Tabs: ${tabs.filter(t => t.trim()).join(", ")}`);
  }

  // ── Test existing thread navigation ──
  console.log("\n4. Testing thread navigation...");
  // Check for Dashboard link
  const dashBtn = page.locator('a:has-text("Dashboard"), button:has-text("Dashboard")').first();
  if (await dashBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dashBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: "agents-dashboard.png", fullPage: true });
    console.log(`  Dashboard: ${page.url()}`);

    // Look for project/thread cards
    const cards = await page.locator('[class*="card"], [class*="project"], [class*="thread"]').count();
    console.log(`  Found ${cards} card elements`);
  }

  await browser.close();
  console.log("\n=== Done ===");
})();
