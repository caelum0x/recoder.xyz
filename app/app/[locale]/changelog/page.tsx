import type { Metadata } from 'next';
import { Sparkles, Zap, Bug, Shield } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getChangelogEntries } from '@/lib/cms/changelog';

export const metadata: Metadata = {
  title: 'Changelog - Recoder.xyz',
  description: 'Track the latest updates, new features, improvements, and bug fixes for Recoder.xyz.',
  openGraph: {
    title: 'Changelog - Recoder.xyz',
    description: 'Track the latest updates, new features, improvements, and bug fixes for Recoder.xyz.',
    url: 'https://recoder.xyz/changelog',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Changelog' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Changelog - Recoder.xyz',
    description: 'Track the latest updates, new features, improvements, and bug fixes for Recoder.xyz.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/changelog',
  },
};

export default async function ChangelogPage() {
  const releases = await getChangelogEntries();

  const getIcon = (type: string) => {
    switch (type) {
      case 'feature': return <Sparkles className="w-4 h-4 text-green-500" />;
      case 'improvement': return <Zap className="w-4 h-4 text-blue-500" />;
      case 'fix': return <Bug className="w-4 h-4 text-orange-500" />;
      case 'security': return <Shield className="w-4 h-4 text-purple-500" />;
      default: return <Sparkles className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">Changelog</h1>
          <p className="text-xl text-gray-400">Track our progress and new features</p>
        </div>

        <div className="space-y-12">
          {releases.map((release, i) => (
            <div key={i} className="relative pl-8 border-l-2 border-white/10">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-orange-500 rounded-full" />
              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="px-3 py-1 bg-orange-500/20 text-orange-500 rounded-full text-sm font-mono">
                    {release.version}
                  </span>
                  <span className="text-gray-500">{release.date}</span>
                </div>
                <h2 className="text-2xl font-bold">{release.title}</h2>
              </div>
              <ul className="space-y-3">
                {release.changes.map((change, j) => (
                  <li key={j} className="flex items-start space-x-3">
                    {getIcon(change.type)}
                    <span className="text-gray-300">{change.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
