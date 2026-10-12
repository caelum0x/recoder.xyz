import type { MetadataRoute } from "next";
import { DOC_PAGES } from "./docs/content";
import { USE_CASES } from "./use-cases/use-cases";
import { getChangelog } from "./changelog/entries";

const BASE = "https://recoder.xyz";

// Evaluated when the sitemap is generated at build time, so lastModified tracks
// each deploy instead of a frozen literal.
const BUILD_DATE = new Date();

// The changelog's freshness is driven by its newest entry, not the build.
function changelogDate(): Date {
  const [latest] = getChangelog();
  return latest ? new Date(latest.date) : BUILD_DATE;
}

interface RouteConfig {
  path: string;
  lastModified: Date;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: RouteConfig[] = [
    { path: "", lastModified: BUILD_DATE, priority: 1, changeFrequency: "weekly" },
    { path: "/download", lastModified: BUILD_DATE, priority: 0.8, changeFrequency: "weekly" },
    { path: "/features", lastModified: BUILD_DATE, priority: 0.8, changeFrequency: "monthly" },
    { path: "/how-it-works", lastModified: BUILD_DATE, priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs", lastModified: BUILD_DATE, priority: 0.7, changeFrequency: "weekly" },
    ...DOC_PAGES.map((p) => ({
      path: `/docs/${p.slug}`,
      lastModified: BUILD_DATE,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    { path: "/use-cases", lastModified: BUILD_DATE, priority: 0.8, changeFrequency: "monthly" },
    ...USE_CASES.map((u) => ({
      path: `/use-cases/${u.slug}`,
      lastModified: BUILD_DATE,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
    { path: "/enterprise", lastModified: BUILD_DATE, priority: 0.7, changeFrequency: "monthly" },
    { path: "/design-partners", lastModified: BUILD_DATE, priority: 0.6, changeFrequency: "monthly" },
    { path: "/proof", lastModified: BUILD_DATE, priority: 0.6, changeFrequency: "monthly" },
    { path: "/self-host", lastModified: BUILD_DATE, priority: 0.6, changeFrequency: "monthly" },
    { path: "/pricing", lastModified: BUILD_DATE, priority: 0.8, changeFrequency: "weekly" },
    { path: "/changelog", lastModified: changelogDate(), priority: 0.6, changeFrequency: "weekly" },
    { path: "/contact", lastModified: BUILD_DATE, priority: 0.4, changeFrequency: "yearly" },
    { path: "/refund", lastModified: BUILD_DATE, priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", lastModified: BUILD_DATE, priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", lastModified: BUILD_DATE, priority: 0.3, changeFrequency: "yearly" },
  ];

  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: r.lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
