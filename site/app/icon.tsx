import { ImageResponse } from "next/og";

// App icon (favicon). Next.js renders this to a real PNG at build time.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080a",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 5,
            border: "2px solid rgba(255,255,255,0.30)",
            background: "#0e0e11",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: "#ededf0",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
