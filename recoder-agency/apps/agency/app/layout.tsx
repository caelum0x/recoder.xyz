import type { Metadata } from "next";
import "./globals.css";
import { DM_Mono, DM_Sans } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";

const title = "Recoder Agency";
const description =
	"AI-powered agency platform. Automate service delivery with intelligent workflows.";
const url = process.env.NEXT_PUBLIC_SITE_URL || "https://agency.recoder.xyz";

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
			<body>
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
