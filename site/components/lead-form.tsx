"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "done" | "error";

interface LeadFormProps {
  kind: "notify" | "sales";
  /** Tracks where the lead came from, e.g. "download", "enterprise". */
  source: string;
  /** For notify: which platform card was clicked. */
  platform?: string;
  /** For sales: which plan, e.g. "Team" / "Enterprise". */
  plan?: string;
  /** Show a free-text message field (sales). */
  withMessage?: boolean;
  submitLabel: string;
  successText: string;
  className?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LeadForm({
  kind,
  source,
  platform,
  plan,
  withMessage = false,
  submitLabel,
  successText,
  className = "",
}: LeadFormProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: a hidden field real users never fill. Bots that auto-fill it are
  // silently dropped without hitting the API.
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trap) {
      // Pretend success to a bot; never touch the API.
      setStatus("done");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError("Please enter a valid email address.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          email,
          platform,
          plan,
          message: withMessage ? message : undefined,
          source,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className={"text-sm text-accent " + className} role="status">
        {successText}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={"flex flex-col gap-3 " + className}>
      {/* Honeypot — visually hidden, off-screen, excluded from tab + a11y tree. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company-website">Leave this field empty</label>
        <input
          id="company-website"
          name="company-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          disabled={status === "submitting"}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-soft px-4 py-2.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-lg bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {status === "submitting" ? "Sending…" : submitLabel}
        </button>
      </div>
      {withMessage && (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Team size, what you want to coordinate, timeline…"
          aria-label="Message"
          rows={3}
          disabled={status === "submitting"}
          className="rounded-lg border border-border-strong bg-bg-soft px-4 py-2.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent disabled:opacity-60"
        />
      )}
      {status === "error" && error && (
        <p className="text-xs text-amber-400" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-faint">
        By submitting, you agree to our{" "}
        <Link href="/privacy" className="text-muted underline hover:text-fg">
          Privacy Policy
        </Link>
        . We&apos;ll only email you about this request.
      </p>
    </form>
  );
}
