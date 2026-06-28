import { ImageResponse } from "next/og";

// Shared 1200x630 social card used by both opengraph-image and twitter-image.
// Rendered to a real PNG at build time by Next.js — no binary asset checked in.
export const SOCIAL_SIZE = { width: 1200, height: 630 };
export const SOCIAL_CONTENT_TYPE = "image/png";

export function renderSocialImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#08080a",
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(110,139,255,0.18), transparent 70%)",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              border: "3px solid rgba(255,255,255,0.30)",
              background: "#0e0e11",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: "#ededf0",
              }}
            />
          </div>
          <div
            style={{
              color: "#ededf0",
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            Recoder
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              color: "#ededf0",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            Run your coding agents as a team.
          </div>
          <div
            style={{
              color: "#8a8a94",
              fontSize: 34,
              lineHeight: 1.3,
              maxWidth: 900,
            }}
          >
            One shared brain for your own Claude Code, Codex, and opencode. Your
            agents, your keys, coordinated.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#56565f",
            fontSize: 26,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: "#6e8bff",
            }}
          />
          recoder.xyz · the control plane for coding agents
        </div>
      </div>
    ),
    { ...SOCIAL_SIZE },
  );
}
