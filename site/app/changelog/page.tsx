import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site";
import { getChangelog } from "./entries";

export const metadata: Metadata = {
  title: "Recoder changelog",
  description:
    "Follow Recoder releases and public product changes across coding-agent coordination, review, governance, and desktop availability.",
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
        <section className="mt-8 rounded-xl border border-border bg-bg-soft p-6">
          <h2 className="text-lg font-medium">How to read this changelog</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Entries describe public product changes, not internal experiments or
            roadmap promises. Each item names what became usable and when. Desktop
            availability is tracked separately on the download page so an entry
            never implies that an installer exists before it is actually public.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            For installation status, supported platforms, and release checksums,
            use the{" "}
            <a href="/download" className="text-accent underline-offset-4 hover:underline">
              download page
            </a>
            . For setup and behavior, use the{" "}
            <a href="/docs" className="text-accent underline-offset-4 hover:underline">
              documentation
            </a>
            . The RSS feed mirrors this page for readers who prefer release updates
            without an account.
          </p>
        </section>
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
