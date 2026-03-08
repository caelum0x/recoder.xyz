"use client";

import { usePlatformApi, PLATFORM_BASE } from "./platform-api";

interface SubscriptionData {
  plan: string;
  subscription_status: string;
}

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  FREE: { bg: "rgba(255,255,255,0.1)", text: "#aaa" },
  PRO: { bg: "rgba(249,115,22,0.15)", text: "#f97316" },
  TEAM: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
  ENTERPRISE: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
};

export function SubscriptionBadge() {
  const { data } = usePlatformApi<SubscriptionData>(
    "/api/user/subscription",
    { refreshInterval: 300000 }
  );

  if (!data) return null;

  const plan = data.plan?.toUpperCase() ?? "FREE";
  const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.FREE;
  const isFree = plan === "FREE";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          letterSpacing: "0.02em",
        }}
      >
        {plan}
      </span>
      {isFree && (
        <a
          href={`${PLATFORM_BASE}/billing/upgrade`}
          style={{
            fontSize: "11px",
            color: "#f97316",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Upgrade
        </a>
      )}
    </div>
  );
}
