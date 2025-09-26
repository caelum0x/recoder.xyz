import type { Metadata } from "next";
import PlausibleProvider from "next-plausible";
import { getBrandConfig } from "../lib/recoder-config";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import AuthProvider from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import PWAInitializer from "@/components/pwa/pwa-initializer";
import { Web3Provider } from "@/providers/Web3Provider";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { NearProvider } from "@/providers/NearProvider";
import { SmartUpgradeWrapper } from "@/components/smart-upgrade/SmartUpgradeWrapper";
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
    apple: "/icons/apple-icon-180.png",
  },
  manifest: "/api/pwa/manifest",
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brandConfig.fullName,
  },
  applicationName: brandConfig.fullName,
  category: "productivity",
  keywords: [
    "AI development",
    "code generation", 
    "progressive web app",
    "developer tools",
    "real-time collaboration",
    "offline development"
  ]
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
      <body className="h-full flex min-h-full flex-col bg-gray-100 text-gray-900 antialiased web-builder-container">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <AnalyticsProvider>
              <SmartUpgradeWrapper>
                <Web3Provider>
                  <SolanaProvider>
                    <NearProvider>
                      <PWAInitializer />
                      {children}
                      <Toaster />
                    </NearProvider>
                  </SolanaProvider>
                </Web3Provider>
              </SmartUpgradeWrapper>
            </AnalyticsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
