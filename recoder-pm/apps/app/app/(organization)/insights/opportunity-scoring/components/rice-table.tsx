"use client";

import { useState } from "react";

type RiceRow = {
  id: string;
  featureId: string;
  featureTitle: string;
  featureStatus: string;
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  compositeScore: number;
  reachReason: string;
  impactReason: string;
  confidenceReason: string;
  effortReason: string;
};

type SortKey =
  | "featureTitle"
  | "reach"
  | "impact"
  | "confidence"
  | "effort"
  | "compositeScore";

type SortDirection = "asc" | "desc";

type RiceTableProps = {
  readonly rows: RiceRow[];
};

const impactLabels: Record<number, string> = {
  1: "Minimal",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Massive",
};

const columns: { key: SortKey; label: string }[] = [
  { key: "featureTitle", label: "Feature" },
  { key: "reach", label: "Reach" },
  { key: "impact", label: "Impact" },
  { key: "confidence", label: "Confidence" },
  { key: "effort", label: "Effort" },
  { key: "compositeScore", label: "Score" },
];

export const RiceTable = ({ rows }: RiceTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    const aNum = Number(aVal);
    const bNum = Number(bVal);
    return sortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-muted-foreground text-sm">
        No RICE scores yet. Click Recalculate to generate scores.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                className="cursor-pointer select-none px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                key={col.key}
                onClick={() => handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key ? (
                    <span className="text-xs">
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <tr
                className="group cursor-pointer border-b last:border-0 hover:bg-muted/30"
                key={row.id}
                onClick={() => setExpandedId(expanded ? null : row.id)}
              >
                <td className="px-4 py-3" colSpan={6}>
                  <div className="grid grid-cols-6 gap-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {row.featureTitle}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {row.featureStatus}
                      </span>
                    </div>
                    <div className="flex items-center tabular-nums">
                      {row.reach}
                    </div>
                    <div className="flex items-center">
                      {impactLabels[row.impact] ?? row.impact} ({row.impact})
                    </div>
                    <div className="flex items-center tabular-nums">
                      {row.confidence}%
                    </div>
                    <div className="flex items-center tabular-nums">
                      {row.effort}
                    </div>
                    <div className="flex items-center font-semibold tabular-nums">
                      {row.compositeScore.toFixed(1)}
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-3 grid gap-2 rounded-md border bg-muted/20 p-3 text-xs">
                      <div>
                        <span className="font-semibold">Reach:</span>{" "}
                        {row.reachReason}
                      </div>
                      <div>
                        <span className="font-semibold">Impact:</span>{" "}
                        {row.impactReason}
                      </div>
                      <div>
                        <span className="font-semibold">Confidence:</span>{" "}
                        {row.confidenceReason}
                      </div>
                      <div>
                        <span className="font-semibold">Effort:</span>{" "}
                        {row.effortReason}
                      </div>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
