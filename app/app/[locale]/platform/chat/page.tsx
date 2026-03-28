import { redirect } from 'next/navigation';

/**
 * The standalone Chat platform was merged into Agents.
 * Redirect any lingering links to the Agents platform page.
 */
export default function ChatRedirect() {
  redirect('/platform/agents');
}
