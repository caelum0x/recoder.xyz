import type { MetadataRoute } from "next";
import { DOC_PAGES } from "./docs/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://recoder.xyz";
  const routes = [
    "",
    "/download",
    "/how-it-works",
    "/docs",
    ...DOC_PAGES.map((p) => `/docs/${p.slug}`),
    "/enterprise",
    "/design-partners",
    "/proof",
    "/self-host",
    "/pricing",
    "/changelog",
    "/privacy",
    "/terms",
  ];
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: new Date("2026-08-23"),
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.7,
  }));
}
