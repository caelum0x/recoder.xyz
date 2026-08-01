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
    "/self-host",
    "/pricing",
    "/changelog",
    "/privacy",
    "/terms",
  ];
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: new Date("2026-06-24"),
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.7,
  }));
}
