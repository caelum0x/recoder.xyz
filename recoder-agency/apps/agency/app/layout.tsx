import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { roobert, roobertMono } from "./fonts/roobert";

const title = "Recoder Agency";
const description =
	"AI-powered agency platform. Automate service delivery with intelligent workflows.";
const canonicalAgencyUrl = "https://agency.recoder.xyz";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const url =
	configuredSiteUrl &&
	configuredSiteUrl.includes("agency.recoder.xyz")
		? configuredSiteUrl
		: canonicalAgencyUrl;

export const metadata: Metadata = {
	title,
	description,
	metadataBase: new URL(url),
	alternates: {
		canonical: url,
	},
	icons: {
		icon: [
			{ url: "/favicon.png", sizes: "32x32", type: "image/png" },
			{ url: "/icon.png", sizes: "512x512", type: "image/png" },
		],
		shortcut: "/favicon.ico",
		apple: "/apple-touch-icon.png",
	},
	openGraph: {
		title,
		description,
		url,
		siteName: title,
		images: [
			{
				url: `${url}/og.jpg`,
				width: 1200,
				height: 600,
			},
		],
		locale: "en_US",
		type: "website",
	},
};

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "Organization",
	name: "Recoder",
	url,
	logo: `${url}/logo.png`,
	description,
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${roobert.variable} ${roobertMono.variable} ${roobert.className}`}
		>
			<head>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
			</head>
			<body>
				<a
					href="/"
					aria-label="Recoder Home"
					className="fixed left-4 top-4 z-[9999] rounded-lg border border-white/10 bg-black/30 p-1 backdrop-blur-sm"
				>
					<Image src="/logo.png" alt="Recoder logo" width={36} height={36} />
				</a>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					disableTransitionOnChange
				>
					<NuqsAdapter>{children}</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
