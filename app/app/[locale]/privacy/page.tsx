import { redirect } from 'next/navigation';

// De-duplicated: the canonical Privacy Policy lives at /legal/privacy (linked by
// the footer). This short path used to render a thinner, divergent copy. To keep
// a single source of truth — and so the signup consent link (/privacy) and any
// checkout flow reach the same reviewed policy — we permanently redirect here.
export default function PrivacyRedirect() {
  redirect('/legal/privacy');
}
