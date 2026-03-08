"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { platformFetch, usePlatformApi } from "../hooks/use-platform-api";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
  metadata?: { sourceApp?: string };
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const APP_COLORS: Record<string, string> = {
  agents: "#f97316",
  agency: "#a855f7",
  pm: "#3b82f6",
  web: "#22c55e",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = usePlatformApi<NotificationsResponse>(
    "/api/platform/notifications?limit=20",
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      await platformFetch(`/api/platform/notifications/${id}/read`, {
        method: "PATCH",
      });
      refetch();
    },
    [refetch]
  );

  const markAllRead = useCallback(async () => {
    await platformFetch("/api/platform/notifications/read-all", {
      method: "POST",
    });
    refetch();
  }, [refetch]);

  const unread = data?.unreadCount ?? 0;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          position: "relative",
          padding: "6px",
          color: "inherit",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: "#f97316",
              color: "white",
              borderRadius: "9999px",
              fontSize: "10px",
              fontWeight: "bold",
              minWidth: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "8px",
            width: "360px",
            maxHeight: "480px",
            overflowY: "auto",
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "14px", color: "white" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f97316",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {!data?.notifications?.length ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#888", fontSize: "13px" }}>
              No notifications yet
            </div>
          ) : (
            data.notifications.map((n) => {
              const appColor = APP_COLORS[n.metadata?.sourceApp ?? ""] ?? "#888";
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.actionUrl) window.open(n.actionUrl, "_blank");
                  }}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: n.actionUrl ? "pointer" : "default",
                    background: n.read ? "transparent" : "rgba(249,115,22,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: n.read ? "transparent" : appColor,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500, fontSize: "13px", color: "white" }}>
                      {n.title}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#666", flexShrink: 0 }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#aaa", marginLeft: "14px" }}>
                    {n.message}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
