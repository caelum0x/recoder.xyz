import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
import type { Metadata } from "next";
import Image from "next/image";
import { type ReactNode, Suspense } from "react";
import { QueryProvider } from "@/providers/query-provider";
import { Identify } from "./components/identify";
import { Pageview } from "./components/pageview";
import { env } from "@/env";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const siteUrl = env.RECODER_PM_API_URL;
const title = "Recoder PM App";
const description = "Recoder PM workspace for product operations, feature management, and internal workflows.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  <html className={fonts} lang="en" suppressHydrationWarning>
    <body className="min-h-screen bg-backdrop">
      <a
        href="/"
        aria-label="Recoder Home"
        style={{ position: "fixed", left: 12, top: 12, zIndex: 9999 }}
      >
        <Image src="/logo.png" alt="Recoder logo" width={36} height={36} />
      </a>
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
