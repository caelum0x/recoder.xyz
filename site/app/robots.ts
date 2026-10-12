import type { MetadataRoute } from "next";

// AI answer-engine and search crawlers we explicitly welcome, so the site's
// structured entity mesh (comparisons, the agents directory, docs) can be read
// and cited. Same posture as the yokharita playbook.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Anthropic-AI",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

// Private/POST-only surfaces that don't belong in a crawl.
const DISALLOW = ["/api/admin", "/api/leads", "/api/pilots", "/api/proof"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: "https://recoder.xyz/sitemap.xml",
    host: "https://recoder.xyz",
  };
}
