import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private pilot operations | Recoder",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
};

export default function PilotOperationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
