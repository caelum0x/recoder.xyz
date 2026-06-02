import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/docs/getting-started', label: 'Getting Started' },
  { href: '/docs', label: 'Docs' },
  { href: '/security', label: 'Security' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
  { href: '/platform', label: 'Platform' },
  { href: '/agents', label: 'Agents' },
  { href: 'https://github.com/recoderxyz', label: 'GitHub', external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-10">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-8 grid gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">BYOK-first developer platform</p>
            <h3 className="text-2xl font-bold text-white mb-2">Use your own provider keys. Keep your workflow.</h3>
            <p className="max-w-2xl text-sm text-gray-400">
              Recoder is built for fast activation: sign in, connect a provider, start in the right surface, and move across coding, planning, and delivery without changing tools.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
            {[
              'OAuth-first signup',
              'Encrypted key storage',
              'Docs and trust pages linked',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-gray-300">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Recoder" className="w-6 h-6 rounded-md" />
            <span className="text-sm text-gray-400">recoder.xyz</span>
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
