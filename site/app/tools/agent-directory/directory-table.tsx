"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AGENTS,
  AGENT_GROUPS,
  type AgentGroup,
  type AgentEntry,
} from "../agents";

type Filter = AgentGroup | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  ...AGENT_GROUPS.map((g) => ({ id: g.id as Filter, label: g.label })),
];

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-border-strong bg-fg text-bg"
          : "border-border bg-bg-soft text-muted hover:text-fg")
      }
    >
      {children}
    </button>
  );
}

function Row({ a }: { a: AgentEntry }) {
  const compare = a.compareSlugs[0];
  return (
    <tr id={a.slug} className="border-b border-border last:border-0 align-top">
      <td className="px-4 py-3">
        <a
          href={a.homepage}
          target="_blank"
          rel="noreferrer nofollow"
          className="font-medium text-fg hover:text-accent"
        >
          {a.name}
        </a>
        <div className="mt-0.5 text-xs text-faint">{a.vendor}</div>
        {compare ? (
          <Link
            href={`/compare/${compare}`}
            className="mt-1 inline-block text-xs text-accent hover:underline"
          >
            Compare →
          </Link>
        ) : null}
      </td>
      <td className="px-4 py-3 text-muted">{a.kind}</td>
      <td className="px-4 py-3 text-muted">{a.formFactor}</td>
      <td className="px-4 py-3 text-muted">{a.models}</td>
      <td className="px-4 py-3">
        <span className={a.oss ? "text-fg" : "text-muted"}>{a.license}</span>
      </td>
    </tr>
  );
}

export function DirectoryTable() {
  const [filter, setFilter] = useState<Filter>("all");
  const [ossOnly, setOssOnly] = useState(false);

  const rows = useMemo(() => {
    return AGENTS.filter((a) => {
      if (filter !== "all" && a.group !== filter) return false;
      if (ossOnly && !a.oss) return false;
      return true;
    });
  }, [filter, ossOnly]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <FilterButton
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </FilterButton>
          ))}
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={ossOnly}
            onChange={(e) => setOssOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Open source only
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-soft">
              <th className="px-4 py-2.5 font-medium text-fg">Tool</th>
              <th className="px-4 py-2.5 font-medium text-fg">Category</th>
              <th className="px-4 py-2.5 font-medium text-fg">Form factor</th>
              <th className="px-4 py-2.5 font-medium text-fg">Models</th>
              <th className="px-4 py-2.5 font-medium text-fg">License</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <Row key={a.slug} a={a} />
            ))}
          </tbody>
        </table>
      </div>

      <p
        className="mt-3 text-xs text-faint"
        role="status"
        aria-live="polite"
      >
        Showing {rows.length} of {AGENTS.length} tools
        {ossOnly ? " (open source only)" : ""}.
      </p>
    </div>
  );
}
