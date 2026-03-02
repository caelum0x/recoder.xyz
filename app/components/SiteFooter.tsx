import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/agents', label: 'Agents' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/enterprise', label: 'Enterprise' },
  { href: '/alternatives', label: 'Alternatives' },
  { href: '/docs', label: 'Docs' },
  { href: '/docs/api-reference', label: 'API Reference' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/terms', label: 'Terms' },
  { href: 'https://github.com/recoderxyz', label: 'GitHub', external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-12 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg" />
            <span className="font-bold">recoder</span>
          </div>

          <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            {FOOTER_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          <div className="text-sm text-gray-500">
            &copy; 2024&ndash;2026 Recoder.xyz
          </div>
        </div>
      </div>
    </footer>
  );
}
