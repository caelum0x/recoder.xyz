'use client';

import { siteConfig } from '@/lib/site-config';
import Link from 'next/link';
import { RecoderLogo } from '@/components/sidebar/recoder-logo';

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="w-full pb-0 px-6">
      <div className="w-full mx-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between p-10">
            <div className="flex flex-col items-start justify-start gap-y-5 max-w-xs mx-0">
              <Link href="/" className="flex items-center gap-2">
                <RecoderLogo size={18} variant="logomark" />
              </Link>
              <p className="tracking-tight text-muted-foreground font-medium">
                {siteConfig.hero.description}
              </p>
            </div>
            <div className="pt-5 md:w-1/2">
              <div className="flex flex-col items-start justify-start md:flex-row md:items-start md:justify-between gap-y-5 lg:pl-10">
                {siteConfig.footerLinks.map((column, columnIndex) => (
                  <ul key={columnIndex} className="flex flex-col gap-y-2">
                    <li className="mb-2 text-sm font-semibold text-primary">
                      {column.title}
                    </li>
                    {column.links.map((link) => (
                      <li
                        key={link.id}
                        className="text-[15px]/snug text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Link
                          href={link.url}
                          {...(link.url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        >
                          {link.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="px-10 pb-10 pt-4 border-t border-border/40 mx-10">
            <p className="text-sm text-muted-foreground text-center">
              © {currentYear} Recoder. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
