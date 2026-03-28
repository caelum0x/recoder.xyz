import { redirect } from 'next/navigation';

/**
 * Recoder Studio was abandoned and merged into Agency.
 * Redirect any lingering links to the Agency platform page.
 */
export default function StudioRedirect() {
  redirect('/platform/agency');
}
