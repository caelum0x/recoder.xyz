import { redirect } from 'next/navigation';

/**
 * The pre-pivot "Web IDE ↔ CLI sync" workflow no longer exists.
 * Recoder is a desktop app that runs your coding agents in parallel
 * isolated git worktrees — see the getting-started guide instead.
 */
export default function WebCLISyncGuidePage() {
  redirect('/docs/getting-started');
}
