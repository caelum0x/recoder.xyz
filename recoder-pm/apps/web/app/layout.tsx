import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import { type ReactNode, Suspense } from "react";
import { CallToAction } from "@/components/cta";
import { Footer } from "@/components/footer";
import { Identify } from "@/components/identify";
import { Navbar } from "@/components/navbar";
import { Pageview } from "@/components/pageview";
import { env } from "@/env";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const isPlaceholderValue = (value: string | undefined) =>
  !value ||
  value.includes("placeholder") ||
  value.includes("build-widget-id") ||
  value.includes("disabled");

const apiUrl =
  process.env.RECODER_PM_API_URL ?? env.RECODER_PM_API_URL ?? "";
const siteUrl =
  process.env.RECODER_PM_WEB_URL ??
  env.RECODER_PM_WEB_URL ??
  "https://pm.recoder.xyz";
const normalizedApiUrl = apiUrl
  ? apiUrl.endsWith("/")
    ? apiUrl
    : `${apiUrl}/`
  : "";
const widgetSrc = normalizedApiUrl
  ? new URL("widget.js", normalizedApiUrl).toString()
  : "";
const widgetId = env.RECODER_PM_ADMIN_WIDGET_ID || "";
const shouldLoadWidget = !isPlaceholderValue(widgetId) && Boolean(widgetSrc);
const title = "Recoder PM";
const description =
  "Recoder PM marketing site and customer-facing product management workspace.";

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
        aria-label="Recoder Home"
        href="/"
        style={{ position: "fixed", left: 12, top: 12, zIndex: 9999 }}
      >
        <Image alt="Recoder logo" height={36} src="/logo.png" width={36} />
      </a>
      <AnalyticsProvider>
        <Suspense fallback={null}>
          <Pageview />
          <Identify />
        </Suspense>
        <DesignSystemProvider>
          <Navbar />
          <main className="divide-y">
            {children}
            <CallToAction />
            <Footer />
          </main>
        </DesignSystemProvider>
      </AnalyticsProvider>
      {shouldLoadWidget && (
        <Script id="widget">{`
        (function() {
          window.RecoderPmWidgetId = '${widgetId}';
          window.RecoderPmApiUrl = '${apiUrl}';
          var s = document.createElement('script');
          s.type = 'text/javascript';
          s.async = true;
          s.src = '${widgetSrc}';
          var x = document.getElementsByTagName('script')[0];
          x.parentNode.insertBefore(s, x);
        })();
      `}</Script>
      )}
    </body>
  </html>
);

export default RootLayout;
