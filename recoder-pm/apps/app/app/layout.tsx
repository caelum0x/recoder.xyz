import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
import Image from "next/image";
import { type ReactNode, Suspense } from "react";
import { QueryProvider } from "@/providers/query-provider";
import { Identify } from "./components/identify";
import { Pageview } from "./components/pageview";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html className={fonts} lang="en" suppressHydrationWarning>
    <body className="min-h-screen bg-backdrop">
      <a
        href="/"
        aria-label="Recoder Home"
        style={{ position: "fixed", left: 12, top: 12, zIndex: 9999 }}
      >
        <Image src="/icon.png" alt="Recoder logo" width={36} height={36} />
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
