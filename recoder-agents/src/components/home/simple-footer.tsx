'use client';

import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { RecoderLogo } from '@/components/sidebar/recoder-logo';

export function SimpleFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-background/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        {/* Main footer content */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1 space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 group">
              <RecoderLogo size={18} variant="logomark" />
            </Link>
          </div>

          {/* Link columns from site config */}
          {siteConfig.footerLinks.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                {column.title}
              </h3>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.url}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      {...(link.url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-border/40">
          <p className="text-sm text-muted-foreground text-center">
            © {currentYear} Recoder. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

