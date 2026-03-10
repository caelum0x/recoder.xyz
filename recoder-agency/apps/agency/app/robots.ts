import type { MetadataRoute } from "next";

const baseUrl =
	process.env.NEXT_PUBLIC_SITE_URL || "https://agency.recoder.xyz";

const disallowedPaths: string[] = [
	"/join/",
	"/auth/callback/",
	"/auth/connect/",
	"/password_reset/confirm",
	"/webhooks/",
	"/api/",
	"/workspaces/",
	"/settings/",
];

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: disallowedPaths,
			},
		],
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}
