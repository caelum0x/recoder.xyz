import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
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

const apiUrl = env.RECODER_PM_API_URL || process.env.RECODER_PM_API_URL || "";
const widgetSrc = apiUrl ? new URL("/widget.js", apiUrl).toString() : "";

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
          <Navbar />
          <main className="divide-y">
            {children}
            <CallToAction />
            <Footer />
          </main>
        </DesignSystemProvider>
      </AnalyticsProvider>
      {!!widgetSrc && (
        <Script id="widget">{`
        (function() {
          window.RecoderPmWidgetId = '${env.RECODER_PM_ADMIN_WIDGET_ID || ""}';
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
