import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import type { Metadata } from "next";
import Image from "next/image";
import localFont from "next/font/local";
import Script from "next/script";
import { type ReactNode, Suspense } from "react";
import { AppSwitcher } from "@/components/app-switcher";
import { CallToAction } from "@/components/cta";
import { Footer } from "@/components/footer";
import { Identify } from "@/components/identify";
import { Navbar } from "@/components/navbar";
import { Pageview } from "@/components/pageview";
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
  <html
    className={`${roobertSans.variable} ${roobertMono.variable} touch-manipulation font-sans antialiased`}
    lang="en"
    suppressHydrationWarning
  >
    <body className="min-h-screen bg-backdrop">
      <div className="fixed left-4 top-4 z-[9999] flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-1.5 py-1 backdrop-blur-sm">
        <a aria-label="Recoder Home" href="/">
          <Image alt="Recoder logo" height={36} src="/logo.png" width={36} />
        </a>
        <AppSwitcher />
      </div>
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
