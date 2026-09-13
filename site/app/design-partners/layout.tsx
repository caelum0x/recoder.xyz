import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recoder design partner program",
  description:
    "Apply for a hands-on Recoder pilot using a real repository and repeated coding task, with measured review time and merge outcomes.",
  alternates: { canonical: "https://recoder.xyz/design-partners" },
};

export default function DesignPartnersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
