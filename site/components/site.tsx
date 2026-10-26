import Link from "next/link";
import Image from "next/image";
import { releasesArePublic } from "@/lib/releases";

/**
 * Public GitHub URL — the main monorepo (caelum0x/recoder.xyz), made public
 * 2026-10-27. Override with NEXT_PUBLIC_GITHUB_URL if a fuller public mirror
 * ever replaces this as the canonical link.
 */
export const PUBLIC_GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL?.trim() ||
  "https://github.com/caelum0x/recoder.xyz";

/** Public X/Twitter profile — verified live at x.com/recoderxyz. */
export const PUBLIC_X_URL =
  process.env.NEXT_PUBLIC_X_URL?.trim() || "https://x.com/recoderxyz";

/**
 * The single primary action on every page. One CTA discipline (Cursor).
 *
 * Recoder is a live, subscribable product: anyone can pick a plan and start
 * today. So the default CTA is "Get started", routing to /pricing where a
 * visitor can sign up and subscribe. Once public desktop builds exist
 * (releasesArePublic()), the default flips to a real "Download" pointing at the
 * /download page. Callers can override `label`/`href` (e.g. a page that
 * specifically links to the download page). We never label a button "Download"
 * for a build that isn't public — but the product itself is always purchasable.
 */
export function DownloadButton({
  className = "",
  label,
  href,
}: {
  className?: string;
  label?: string;
  href?: string;
}) {
  const live = releasesArePublic();
  const resolvedHref = href ?? (live ? "/download" : "/pricing");
  const resolvedLabel = label ?? (live ? "Download" : "Get started");
  return (
    <Link
      href={resolvedHref}
      className={
        "inline-flex items-center justify-center rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 " +
        className
      }
    >
      {resolvedLabel}
    </Link>
  );
}

/** Secondary action used on product pages (Contact sales, Read docs, etc.). */
export function SecondaryButton({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const external = href.startsWith("http");
  const cls =
    "inline-flex items-center justify-center rounded-lg border border-border-strong px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-bg-soft " +
    className;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      {/* unoptimized: /_next/image is routed to the co-hosted product app by
          Caddy, which serves its own logo; raw src loads the site's asset. */}
      <Image
        src="/logo-wave.png"
        alt="Recoder"
        width={28}
        height={28}
        priority
        unoptimized
        className="h-7 w-7"
      />
    </Link>
  );
}

// Five destinations max (owner design rule): four core links plus "More".
// Self-host stays a footnote, reachable from the footer.
const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
];

// "/compare" is retired (owner rule 2026-09-25: no competitor pages) and
// permanently redirects to "/" in next.config.ts. Do not link it from nav —
// a nav item that silently bounces to the homepage reads as a broken link.
const MORE_LINKS = [
  { href: "/enterprise", label: "Enterprise" },
  { href: "/proof", label: "Proof" },
  { href: "/changelog", label: "Changelog" },
  { href: "/contact", label: "Contact" },
];

/**
 * Icon-only "More" disclosure. Native <details> keeps it a server component,
 * keyboard-accessible, and working without JavaScript. On small screens it
 * also carries the core links, so mobile gets a real menu.
 */
function MoreMenu() {
  return (
    <details className="group relative">
      <summary
        aria-label="More pages"
        title="More"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-bg-soft hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      </summary>
      <div className="glass-panel absolute right-0 mt-2 w-48 overflow-hidden rounded-xl p-1.5">
        {[...NAV_LINKS.map((l) => ({ ...l, mobileOnly: true })), ...MORE_LINKS.map((l) => ({ ...l, mobileOnly: false }))].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              "block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-bg-soft hover:text-fg" +
              (l.mobileOnly ? " md:hidden" : "")
            }
          >
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <MoreMenu />
          {PUBLIC_GITHUB_URL && (
            <SecondaryButton
              href={PUBLIC_GITHUB_URL}
              label="GitHub"
              className="hidden sm:inline-flex"
            />
          )}
          <DownloadButton />
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const connectLinks = [
    { href: "/contact", label: "Contact" },
    ...(PUBLIC_GITHUB_URL
      ? [{ href: PUBLIC_GITHUB_URL, label: "GitHub" }]
      : []),
    ...(PUBLIC_X_URL ? [{ href: PUBLIC_X_URL, label: "X" }] : []),
  ];
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-muted">
            The terminal IDE for AI agents. Give one task to several, then merge
            the best result.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: "/download", label: "Download" },
            { href: "/features", label: "Features" },
            { href: "/how-it-works", label: "How it works" },
            { href: "/docs", label: "Docs" },
            { href: "/self-host", label: "Self-host" },
            { href: "/changelog", label: "Changelog" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/enterprise", label: "Enterprise" },
            { href: "/pricing", label: "Pricing" },
            { href: "/contact", label: "Contact" },
            { href: "/refund", label: "Refunds" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
          ]}
        />
        <FooterCol title="Connect" links={connectLinks} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-xs text-muted">
          <span>© {new Date().getFullYear()} Recoder</span>
          <span>The terminal IDE for AI agents.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-3 text-xs font-medium uppercase tracking-wider text-faint">
        {title}
      </div>
      <ul className="space-y-2">
        {links.map((l) => {
          const external = l.href.startsWith("http") || l.href.startsWith("mailto:");
          const cls =
            "text-sm text-muted transition-colors hover:text-fg";
          return (
            <li key={l.href}>
              {external ? (
                <a
                  href={l.href}
                  className={cls}
                  {...(l.href.startsWith("http")
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {l.label}
                </a>
              ) : (
                <Link href={l.href} className={cls}>
                  {l.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
