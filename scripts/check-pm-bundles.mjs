import { chromium } from "playwright";

const PM_URL = process.env.PM_URL || "https://pm.recoder.xyz/insights";
const SESSION_TOKEN = process.env.RECODER_SESSION_TOKEN;
const TIMEOUT = Number(process.env.PM_E2E_TIMEOUT_MS || "30000");

const NEXT_CHUNK_PATTERN = /\/_next\/static\/.*\.(?:js|mjs)(?:\?|$)/;
const TOP_LEVEL_EXPORT_PATTERN = /^\s*export\b/m;

async function collectChunkUrls() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  if (SESSION_TOKEN) {
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
  }

  const page = await context.newPage();
  const chunkUrls = new Set();

  page.on("response", (response) => {
    const url = response.url();
    if (NEXT_CHUNK_PATTERN.test(url)) {
      chunkUrls.add(url);
    }
  });

  try {
    await page.goto(PM_URL, {
      waitUntil: "networkidle",
      timeout: TIMEOUT,
    });
    await page.waitForTimeout(3000);
  } finally {
    await browser.close();
  }

  return Array.from(chunkUrls).sort();
}

async function inspectBundle(url) {
  const response = await fetch(url);
  const text = await response.text();

  return {
    url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    topLevelExport: TOP_LEVEL_EXPORT_PATTERN.test(text),
    startsWith: text.slice(0, 160),
  };
}

const chunkUrls = await collectChunkUrls();
const results = await Promise.all(chunkUrls.map(inspectBundle));
const suspicious = results.filter(
  (result) => result.status >= 400 || result.topLevelExport,
);

console.log(
  JSON.stringify(
    {
      page: PM_URL,
      chunkCount: results.length,
      suspiciousCount: suspicious.length,
      suspicious,
    },
    null,
    2,
  ),
);

if (suspicious.length > 0) {
  process.exit(2);
}
