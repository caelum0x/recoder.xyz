import type { MetadataRoute } from "next";

const baseUrl =
	process.env.NEXT_PUBLIC_SITE_URL || "https://agency.recoder.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	return [
		{
			url: baseUrl,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: `${baseUrl}/login`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${baseUrl}/signup`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.6,
		},
		{
			url: `${baseUrl}/stage/showcase`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/portal`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.7,
		},
	];
}
