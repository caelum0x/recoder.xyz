import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/agents', label: 'Agents' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/platform', label: 'Platform' },
  { href: '/docs', label: 'Docs' },
  { href: '/docs/api-reference', label: 'API Reference' },
  { href: '/docs/a2a', label: 'A2A Protocol' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
  { href: 'https://github.com/recoderxyz', label: 'GitHub', external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-10">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center">
            <img src="/logo.png" alt="Recoder" className="w-6 h-6 rounded-md" />
          </div>

          <div className="text-muted-foreground flex items-center flex-wrap gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          <div className="text-muted-foreground text-sm">
            &copy; 2024&ndash;2026 Recoder.xyz
          </div>
        </div>
      </div>
    </footer>
  );
}
