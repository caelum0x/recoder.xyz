import { redirect } from 'next/navigation';

// De-duplicated: the canonical Terms of Service live at /legal/terms (linked by
// the footer). This short path used to render a thinner, divergent copy. To keep
// a single source of truth — and so the signup consent link (/terms) and any
// checkout flow reach the same reviewed terms — we permanently redirect here.
export default function TermsRedirect() {
  redirect('/legal/terms');
}
