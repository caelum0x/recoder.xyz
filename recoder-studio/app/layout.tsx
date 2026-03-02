import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import { GoogleTagManager } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogPageView } from "./posthog-page-view";
import { PHProvider } from "./providers";

const title = "Recoder Studio";
const description = "AI for Agentic Workflows. Human-AI Collaboration";
const url = process.env.NEXT_PUBLIC_SITE_URL || "https://studio.recoder.xyz";

const dmSans = DM_Sans({
	weight: "variable",
	variable: "--font-dm-sans",
	subsets: ["latin"],
});

const dmMono = DM_Mono({
	weight: ["300", "500"],
	variable: "--font-dm-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title,
	description,
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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${dmSans.variable} ${dmMono.variable}`}
		>
			{process.env.GTM_ID && <GoogleTagManager gtmId={process.env.GTM_ID} />}
			<PHProvider>
				<body>
					<a
						href="/"
						aria-label="Recoder Home"
						style={{ position: "fixed", left: 12, top: 12, zIndex: 9999 }}
					>
						<Image src="/favicon.png" alt="Recoder logo" width={36} height={36} />
					</a>
					<ThemeProvider
						attribute="class"
						defaultTheme="dark"
						disableTransitionOnChange
					>
						<Suspense>
							<PostHogPageView />
						</Suspense>
						<NuqsAdapter>{children}</NuqsAdapter>
					</ThemeProvider>
					<SpeedInsights />
				</body>
			</PHProvider>
		</html>
	);
}
