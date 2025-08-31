import type { Metadata } from "next";
import PlausibleProvider from "next-plausible";
import { getBrandConfig } from "../lib/recoder-config";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import AuthProvider from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const brandConfig = getBrandConfig();

let title = `${brandConfig.fullName} – AI Development Platform`;
let description = "AI-powered code generation platform that creates real, production-ready applications with multi-AI intelligence and offline capabilities";
let url = brandConfig.urls.getWebURL();
let ogimage = `${url}/recoder-og.png`;
let sitename = "recoder.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: url,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <PlausibleProvider domain="web.recoder.xyz" />
      </head>
      <body className="h-full web-builder-container">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <AnalyticsProvider>
              {children}
            </AnalyticsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
