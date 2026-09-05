"use client";

/**
 * UsageMeter — the visible upgrade moment for the free tier.
 *
 * Small strip showing requests used vs the ENFORCED window limit (from
 * /api/usage/summary, which reads the same getQuotaStatus() the AI routes
 * gate on). When the quota binds (>=80% used, or blocked outright) it swaps
 * in a contextual "Upgrade — Pro $29/mo" CTA to /billing/upgrade.
 *
 * Renders nothing for unlimited plans, signed-out visitors, or while loading —
 * it must never add noise to the header.
 */

import { usePlatformApi, PLATFORM_BASE } from "./use-platform-api";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { useEffect, useRef } from "react";

interface UsageSummaryData {
  success: boolean;
  used: number;
  limit: number; // -1 = unlimited
  remaining: number;
  allowed: boolean;
  upgradeRequired: boolean;
  upgradeUrl?: string;
}

const NEAR_LIMIT_PERCENT = 80;

export function UsageMeter() {
  const { data } = usePlatformApi<UsageSummaryData>("/api/usage/summary", {
    refreshInterval: 300000,
  });

  const promptedRef = useRef(false);

  const limit = data?.limit ?? 0;
  const used = Math.max(0, data?.used ?? 0);
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const atLimit = !!data && data.success && limit > 0 && !data.allowed;
  const nearLimit = !!data && data.success && limit > 0 && percent >= NEAR_LIMIT_PERCENT;
  const showUpgrade = atLimit || nearLimit;

  useEffect(() => {
    if (showUpgrade && !promptedRef.current) {
      promptedRef.current = true;
      trackEvent(AnalyticsEvents.UPGRADE_PROMPTED, { promptSurface: "usage-meter" });
    }
  }, [showUpgrade]);

  // Nothing to meter: signed out, loading, error, or unlimited plan.
  if (!data || !data.success || limit <= 0) return null;

  const barColor = atLimit ? "#ef4444" : percent >= NEAR_LIMIT_PERCENT ? "#f97316" : "#22c55e";
  const upgradeUrl = `${PLATFORM_BASE}${data.upgradeUrl || "/billing/upgrade"}`;

  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
      title={
        atLimit
          ? "Request limit reached for this period"
          : `${used} of ${limit} requests used this period`
      }
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "11px", color: "#aaa", whiteSpace: "nowrap" }}>
          {used}/{limit} req
        </span>
        <span
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Requests used this period"
          style={{
            display: "inline-block",
            width: "48px",
            height: "4px",
            borderRadius: "9999px",
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              width: `${percent}%`,
              height: "100%",
              borderRadius: "9999px",
              background: barColor,
            }}
          />
        </span>
      </div>
      {showUpgrade && (
        <a
          href={upgradeUrl}
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: atLimit ? "#ef4444" : "#f97316",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {atLimit ? "Limit reached — upgrade to Pro $29/mo" : "Upgrade — Pro $29/mo"}
        </a>
      )}
    </div>
  );
}
