import { baseUrl } from "@repo/lib/consts";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/*", "/api/*"],
    },
    sitemap: new URL("/sitemap.xml", baseUrl).href,
  };
}
