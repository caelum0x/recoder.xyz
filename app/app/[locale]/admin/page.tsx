import Link from 'next/link';

function AdminCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>
      <span className="mt-4 inline-block text-xs text-orange-400">Open</span>
    </Link>
  );
}

export default function AdminHomePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Internal operational tools for growth, infrastructure, and delivery checks.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminCard
          title="KPI Dashboard"
          description="Weekly growth, revenue, engagement, and lifecycle email metrics."
          href="/admin/kpi"
        />
        <AdminCard
          title="Push Tools"
          description="Validate push config and run dry-run/direct web push delivery tests."
          href="/admin/push"
        />
      </div>
    </div>
  );
}
