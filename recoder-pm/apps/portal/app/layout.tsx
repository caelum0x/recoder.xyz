import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { Container } from "@repo/design-system/components/container";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
import type { Metadata } from "next";
import Image from "next/image";
import { type ReactNode, Suspense } from "react";
import { env } from "@/env";
import { Footer } from "./components/footer";
import { Identify } from "./components/identify";
import { Navbar } from "./components/navbar";
import { Pageview } from "./components/pageview";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const siteUrl = env.RECODER_PM_PORTAL_URL;
const title = "Recoder PM Portal";
const description =
  "Customer portal for Recoder PM projects, updates, and feedback.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Recoder PM Portal",
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
    siteName: "Recoder PM Portal",
    title,
    description,
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "Recoder PM Portal",
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
  <html className={fonts} lang="en">
    <body className="bg-background">
      <a
        aria-label="Recoder Home"
        href="/"
        style={{ position: "fixed", left: 12, top: 12, zIndex: 9999 }}
      >
        <Image alt="Recoder logo" height={36} src="/logo.svg" width={36} />
      </a>
      <AnalyticsProvider>
        <Suspense fallback={null}>
          <Pageview />
          <Identify />
        </Suspense>
        <DesignSystemProvider>
          <Navbar />
          <Container className="py-8">{children}</Container>
          <Footer />
        </DesignSystemProvider>
      </AnalyticsProvider>
    </body>
  </html>
);

export default RootLayout;
