"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { platformFetch, usePlatformApi } from "../hooks/use-platform-api";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface TagsResponse {
  tags: Tag[];
}

interface EcosystemTagPickerProps {
  sourceApp: "agents" | "agency" | "pm" | "web";
  externalId: string;
  label: string;
  itemType: string;
  itemUrl: string;
}

export function EcosystemTagPicker(props: EcosystemTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = usePlatformApi<TagsResponse>("/api/platform/tags");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const linkToTag = useCallback(
    async (tagId: string) => {
      await platformFetch(`/api/platform/tags/${tagId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: props.sourceApp,
          externalId: props.externalId,
          label: props.label,
          itemType: props.itemType,
          itemUrl: props.itemUrl,
        }),
      });
      setOpen(false);
    },
    [props]
  );

  const createAndLink = useCallback(async () => {
    if (!newTagName.trim()) return;
    const res = await platformFetch("/api/platform/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim() }),
    });
    if (res.ok) {
      const tag = await res.json();
      await linkToTag(tag.id);
      setNewTagName("");
      refetch();
    }
  }, [newTagName, linkToTag, refetch]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Tag this item"
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "6px",
          cursor: "pointer",
          padding: "4px 8px",
          color: "inherit",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
        Tag
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "4px",
            width: "240px",
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            zIndex: 50,
            padding: "8px",
          }}
        >
          {data?.tags?.map((tag) => (
            <button
              key={tag.id}
              onClick={() => linkToTag(tag.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "6px 8px",
                background: "none",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                color: "white",
                fontSize: "13px",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: tag.color ?? "#888",
                  flexShrink: 0,
                }}
              />
              {tag.name}
            </button>
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: "4px", paddingTop: "8px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag..."
                onKeyDown={(e) => e.key === "Enter" && createAndLink()}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  color: "white",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              <button
                onClick={createAndLink}
                style={{
                  background: "#f97316",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
