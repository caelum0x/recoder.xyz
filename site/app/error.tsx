"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary for the marketing site. Kept self-contained (no
 * server-component imports) so it never pulls server-only env into the client
 * bundle. Renders a branded, calm recovery surface instead of a raw stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console for support; server logging happens in the
    // platform's own error pipeline. Never render the raw message to the user.
    // eslint-disable-next-line no-console
    console.error("recoder-site error boundary:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#08080a",
        color: "#ededf0",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        padding: "1.5rem",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          fontSize: "0.8rem",
          letterSpacing: "0.2em",
          color: "#6e8bff",
        }}
      >
        SOMETHING BROKE
      </span>
      <h1
        style={{
          marginTop: "1rem",
          fontSize: "2rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          maxWidth: "34rem",
        }}
      >
        This run hit an unexpected error.
      </h1>
      <p
        style={{
          marginTop: "1rem",
          maxWidth: "32rem",
          color: "#8a8a94",
          lineHeight: 1.6,
        }}
      >
        We logged what happened. Try again — most transient errors clear on a
        retry. If it keeps happening, use the contact page.
      </p>
      {error?.digest ? (
        <p
          style={{
            marginTop: "0.75rem",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            fontSize: "0.72rem",
            color: "#7c7c85",
          }}
        >
          ref: {error.digest}
        </p>
      ) : null}
      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          gap: "1.25rem",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.5rem",
            background: "#ededf0",
            color: "#08080a",
            padding: "0.75rem 1.5rem",
            fontSize: "0.9375rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{ fontSize: "0.875rem", color: "#8a8a94", textDecoration: "none" }}
        >
          Back to home →
        </Link>
      </div>
    </div>
  );
}
