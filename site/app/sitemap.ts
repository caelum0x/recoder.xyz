import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://recoder.xyz";
  const routes = [
    "",
    "/download",
    "/enterprise",
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
