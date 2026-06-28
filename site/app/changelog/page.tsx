import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site";
import { getChangelog } from "./entries";

export const metadata: Metadata = {
  title: "Recoder changelog",
  description: "What's new in Recoder, the control plane for coding agents.",
  alternates: {
    canonical: "https://recoder.xyz/changelog",
    types: { "application/rss+xml": "https://recoder.xyz/feed.xml" },
  },
};

const ENTRIES = getChangelog();

export default function Changelog() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Changelog
        </h1>
        <p className="mt-3 text-muted">
          Everything we ship, with a date on it.{" "}
          <a
            href="/feed.xml"
            className="text-accent underline-offset-4 hover:underline"
          >
            RSS
          </a>
        </p>
        <div className="mt-12 space-y-12">
          {ENTRIES.map((e) => (
            <article
              key={e.version}
              className="border-t border-border pt-8"
              id={e.version}
            >
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  {e.version}
                </h2>
                <time className="text-xs text-faint">{e.date}</time>
              </div>
              <h3 className="mt-1 text-muted">{e.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {e.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent">·</span>
                    {i}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
