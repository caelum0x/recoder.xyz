import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics";
import { Container } from "@repo/design-system/components/container";
import { DesignSystemProvider } from "@repo/design-system/components/provider";
import { fonts } from "@repo/design-system/lib/fonts";
import Image from "next/image";
import { type ReactNode, Suspense } from "react";
import { Footer } from "./components/footer";
import { Identify } from "./components/identify";
import { Navbar } from "./components/navbar";
import { Pageview } from "./components/pageview";

type RootLayoutProperties = {
  readonly children: ReactNode;
};

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html className={fonts} lang="en">
    <body className="bg-background">
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
          <Container className="py-8">{children}</Container>
          <Footer />
        </DesignSystemProvider>
      </AnalyticsProvider>
    </body>
  </html>
);

export default RootLayout;
