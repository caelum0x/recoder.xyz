import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { type ReactNode, Suspense } from "react";
import { QueryProvider } from "@/providers/query-provider";
import { Identify } from "./components/identify";
import { Pageview } from "./components/pageview";
import { env } from "@/env";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const roobertSans = localFont({
  src: [
    {
      path: "../public/fonts/roobert/RoobertUprightsVF.woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../public/fonts/roobert/RoobertItalicsVF.woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const roobertMono = localFont({
  src: [
    {
      path: "../public/fonts/roobert/RoobertMonoUprightsVF.woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../public/fonts/roobert/RoobertMonoItalicsVF.woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

const rawSiteUrl = env.RECODER_PM_API_URL;
const title = "Recoder PM — Cursor for Product Managers";
const description = "AI-first product management. Automated feedback analysis, intelligent feature prioritization, insight synthesis, and roadmap planning. The way PMs should work.";

function normalizeAbsoluteUrl(value: string | undefined, fallback: string): string {
  try {
    return new URL(value || fallback).toString();
  } catch {
    try {
      return new URL(fallback).toString();
    } catch {
      return fallback.startsWith("http") ? fallback : `https://${fallback}`;
    }
  }
}

function toAbsoluteUrl(value: string | undefined, fallback: string): URL {
  return new URL(normalizeAbsoluteUrl(value, fallback));
}

const siteUrl = normalizeAbsoluteUrl(rawSiteUrl, "https://pm.recoder.xyz/api");

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: toAbsoluteUrl(siteUrl, "https://pm.recoder.xyz/api"),
  title,
  description,
  applicationName: "Recoder PM",
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Recoder PM",
    title,
    description,
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "Recoder PM",
      },
    ],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/icon.png"],
  },
};

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html
    className={`${roobertSans.variable} ${roobertMono.variable} touch-manipulation font-sans antialiased`}
    lang="en"
    suppressHydrationWarning
  >
    <body className="min-h-screen bg-backdrop" suppressHydrationWarning>
      <AnalyticsProvider>
        <Suspense fallback={null}>
          <Pageview />
          <Identify />
        </Suspense>
        <DesignSystemProvider>
          <QueryProvider>{children}</QueryProvider>
        </DesignSystemProvider>
      </AnalyticsProvider>
    </body>
  </html>
);

export default RootLayout;
