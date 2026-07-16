import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Admin | Recoder',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href="/admin"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20 hover:text-white"
          >
            Admin Home
          </Link>
          <Link
            href="/admin/kpi"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20 hover:text-white"
          >
            KPI
          </Link>
          <Link
            href="/admin/push"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-300 hover:border-white/20 hover:text-white"
          >
            Push Tools
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
