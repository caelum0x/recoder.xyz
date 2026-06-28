/**
 * Privacy-respecting analytics, gated entirely behind an env flag.
 *
 * Wire-up is intentionally thin: when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set we
 * render Plausible's documented `<script defer>` snippet for that domain.
 * Plausible is cookieless, does not collect personal data, and does not build
 * cross-site advertising profiles.
 *
 * When the env var is unset (local dev, previews, or anyone who opts out),
 * this renders nothing and sends zero requests — degrade-safe by default.
 *
 * No bespoke/fake tracking: this only loads Plausible's official client. If the
 * flag is set but the script fails to load, nothing is recorded rather than
 * silently faking success.
 *
 * Optional NEXT_PUBLIC_PLAUSIBLE_SRC overrides the script source for
 * self-hosted Plausible instances; it defaults to the hosted plausible.io CDN.
 *
 * Rendered server-side as a plain <script> tag so it appears in the initial
 * HTML (the standard Plausible install) and is trivially verifiable.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();

  // Degrade-safe: no domain configured means no analytics at all.
  if (!domain) {
    return null;
  }

  const src =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim() ||
    "https://plausible.io/js/script.js";

  // eslint-disable-next-line @next/next/no-sync-scripts -- Plausible is loaded
  // with `defer`, so it does not block rendering; a plain tag keeps the install
  // to the vendor's documented snippet and present in the SSR HTML.
  return <script defer data-domain={domain} src={src} />;
}
