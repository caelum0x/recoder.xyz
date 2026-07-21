/**
 * formatPreviewVerifyLine — the terminal-plain "preview checked" line the Run tab
 * shows under the preview URL. A PURE projection over the last
 * {@link PreviewVerificationView} the backend persisted (GET
 * /workspaces/:id/preview-verification): no engine name is ever surfaced (not
 * "browser-use"), the glyph carries the verdict, and a truthful skip/degrade is
 * shown as "not verified", never a fabricated pass.
 *
 * The screenshot PNG is NOT retained in this cut — only an opaque artifact id was
 * sealed — so `screenshotRef` is `null` and we surface the truthful
 * "screenshot not retained" note instead of a broken image. A real screenshot
 * only appears when `screenshotRef` is a non-null URL (a future artifact-store
 * item).
 */
import type { PreviewVerificationView } from './api';

/** Coarse tone for the verify line (used for a11y / future styling). */
export type PreviewVerifyTone = 'passed' | 'failed' | 'skipped' | 'none';

export interface PreviewVerifyLine {
  /** The terminal-plain "preview checked …" text (or "preview not checked"). */
  readonly text: string;
  readonly tone: PreviewVerifyTone;
  /** Truthful note when no image is retained; `null` when a real screenshot exists. */
  readonly screenshotNote: string | null;
  /** The screenshot URL to render as an `<img>`, only when non-null. */
  readonly screenshotRef: string | null;
}

function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** The first failed check's message — the one-line "why it failed" for the operator. */
function firstFailedMessage(view: PreviewVerificationView): string {
  const failed = view.checks.find((check) => check.status === 'failed' && Boolean(check.message));
  if (failed?.message) return failed.message;
  if (view.reason) return view.reason;
  return view.summary || 'check failed';
}

export function formatPreviewVerifyLine(
  view: PreviewVerificationView | null,
  now: number = Date.now(),
): PreviewVerifyLine {
  if (!view) {
    return { text: 'preview not checked', tone: 'none', screenshotNote: null, screenshotRef: null };
  }

  // A truthful skip/degrade proved nothing — never render it as a pass, and carry
  // no screenshot line (the browser run did not capture one).
  if (view.status === 'skipped') {
    const reason = view.reason || view.summary || 'browser unavailable';
    return {
      text: `preview checked — not verified (${reason})`,
      tone: 'skipped',
      screenshotNote: null,
      screenshotRef: null,
    };
  }

  const hasImage = typeof view.screenshotRef === 'string' && view.screenshotRef.length > 0;
  const screenshotRef = hasImage ? view.screenshotRef : null;
  const screenshotNote = hasImage ? null : 'screenshot not retained';

  if (view.status === 'failed') {
    return {
      text: `preview checked ✗ ${firstFailedMessage(view)}`,
      tone: 'failed',
      screenshotNote,
      screenshotRef,
    };
  }

  const when = relativeTime(view.checkedAt, now);
  return {
    text: when ? `preview checked ✓ ${when}` : 'preview checked ✓',
    tone: 'passed',
    screenshotNote,
    screenshotRef,
  };
}
