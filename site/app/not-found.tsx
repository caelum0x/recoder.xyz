import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Page not found — Recoder",
  description:
    "The page you were looking for doesn't exist or has moved. Head back to Recoder or pick up one of the links below.",
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
];

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="grid-faint pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-28 text-center">
          <span className="font-mono text-sm tracking-widest text-accent">
            404
          </span>
          <h1 className="text-balance mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            This branch doesn&apos;t exist.
          </h1>
          <p className="text-balance mx-auto mt-4 max-w-xl text-muted">
            The page you were looking for has moved, been renamed, or never
            shipped. No worktree here — let&apos;s get you back to a known-good
            state.
          </p>
          <div className="mt-8 flex items-center justify-center gap-5">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-fg px-6 py-3 text-[15px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              Back to home
            </Link>
            <Link
              href="/docs"
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              Read the docs →
            </Link>
          </div>
          <nav
            aria-label="Popular pages"
            className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-faint transition-colors hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
      <Footer />
    </>
  );
}
