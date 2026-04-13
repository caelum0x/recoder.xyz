import { chromium } from "playwright";

const PM_URL = process.env.PM_URL || "https://pm.recoder.xyz/insights";
const SESSION_TOKEN = process.env.RECODER_SESSION_TOKEN;
const SESSION_DATA = process.env.RECODER_SESSION_DATA;
const TIMEOUT = Number(process.env.PM_E2E_TIMEOUT_MS || "30000");
const SCREENSHOT_PATH =
  process.env.PM_E2E_SCREENSHOT || "pm-authenticated-e2e.png";
const COPILOT_PROMPT = process.env.PM_E2E_COPILOT_PROMPT?.trim();

if (!SESSION_TOKEN) {
  console.error("RECODER_SESSION_TOKEN is required");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

await context.addCookies([
  {
    name: "recoder.session_token",
    value: SESSION_TOKEN,
    domain: ".recoder.xyz",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
  {
    name: "__Secure-recoder.session_token",
    value: SESSION_TOKEN,
    domain: ".recoder.xyz",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);

if (SESSION_DATA) {
  await context.addCookies([
    {
      name: "_Secure-recoder.session_data",
      value: SESSION_DATA,
      domain: ".recoder.xyz",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const responses = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text());
  }
});

page.on("pageerror", (err) => {
  pageErrors.push({
    message: String(err.message || err),
    stack: String(err.stack || ""),
  });
});

page.on("response", (resp) => {
  if (resp.status() >= 400) {
    responses.push(`${resp.status()} ${resp.url()}`);
  }
});

try {
  const response = await page.goto(PM_URL, {
    waitUntil: "networkidle",
    timeout: TIMEOUT,
  });

  if (COPILOT_PROMPT) {
    await page
      .getByRole("button", {
        name: /AI Co-pilot|Ask AI about your product insights/i,
      })
      .first()
      .click({ timeout: 10000 });

    const input = page.locator(
      'input[placeholder*="product"], input[placeholder*="Ask"], input[placeholder*="What are the top feature requests"]'
    );

    if ((await input.count()) === 0) {
      throw new Error("PM copilot input not found");
    }

    await input.first().fill(COPILOT_PROMPT);
    await input.first().press("Enter");
    await page.waitForTimeout(8000);
  }

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

  const result = {
    status: response?.status() ?? null,
    url: page.url(),
    title: await page.title(),
    consoleErrors,
    pageErrors,
    responses,
    screenshot: SCREENSHOT_PATH,
  };

  console.log(JSON.stringify(result, null, 2));

  if (pageErrors.length > 0) {
    process.exit(2);
  }

  const fatalConsoleErrors = consoleErrors.filter(
    (msg) =>
      msg.includes("Unexpected token 'export'") ||
      msg.includes("Unexpected token export") ||
      msg.includes("Minified React error #418")
  );

  if (fatalConsoleErrors.length > 0) {
    process.exit(3);
  }
} finally {
  await browser.close();
}
