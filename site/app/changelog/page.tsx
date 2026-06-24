import type { Metadata } from "next";
import { Nav, Footer } from "@/components/site";

export const metadata: Metadata = {
  title: "Recoder changelog",
  description: "What's new in Recoder, the control plane for coding agents.",
};

const ENTRIES = [
  {
    version: "0.1.0",
    date: "2026-06-24",
    title: "The coordination layer takes shape",
    items: [
      "Locked the direction: Recoder coordinates your own coding agents instead of being one.",
      "Shared brain, work-locks, and A2A bus designed over the owned control plane.",
      "New recoder.xyz site.",
    ],
  },
];

export default function Changelog() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          Changelog
        </h1>
        <p className="mt-3 text-muted">Everything we ship, with a date on it.</p>
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
