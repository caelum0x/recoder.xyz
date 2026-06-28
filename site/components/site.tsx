import Link from "next/link";

/** The single primary action on every page. One CTA discipline (Cursor/Conductor). */
export function DownloadButton({
  className = "",
  label = "Download Recoder",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link
      href="/download"
      className={
        "inline-flex items-center justify-center rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 " +
        className
      }
    >
      {label}
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
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-md border border-border-strong bg-bg-soft"
      >
        <span className="h-2 w-2 rounded-[2px] bg-fg" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Recoder</span>
    </Link>
  );
}

const NAV_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/self-host", label: "Self-host" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
];

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
        <DownloadButton />
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-faint">
            The control plane for coding agents. Run your own, coordinated.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: "/download", label: "Download" },
            { href: "/#how", label: "How it works" },
            { href: "/self-host", label: "Self-host" },
            { href: "/changelog", label: "Changelog" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/enterprise", label: "Enterprise" },
            { href: "/pricing", label: "Pricing" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
          ]}
        />
        <FooterCol
          title="Connect"
          links={[
            { href: "https://github.com/caelum0x/recoder.xyz", label: "GitHub" },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-xs text-faint">
          <span>© {new Date().getFullYear()} Recoder</span>
          <span>Your agents. Your keys. Coordinated.</span>
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
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
