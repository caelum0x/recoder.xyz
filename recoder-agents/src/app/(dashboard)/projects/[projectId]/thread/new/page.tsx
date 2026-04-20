'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThreadComponent } from '@/components/thread/ThreadComponent';
import { createThreadInProject } from '@/lib/api/threads';

export default function NewThreadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const unwrappedParams = React.use(params);
  const { projectId } = unwrappedParams;
  const router = useRouter();

  // Generate a stable temporary ID for display
  const tempThreadId = useMemo(() => crypto.randomUUID(), []);
  const [resolvedThreadId, setResolvedThreadId] = useState<string | null>(null);

  // Pre-create thread on mount (in background, don't affect UI)
  useEffect(() => {
    let isMounted = true;

    async function preCreateThread() {
      try {
        const result = await createThreadInProject(projectId);

        if (!isMounted) {
          return;
        }

        setResolvedThreadId(result.thread_id);
        router.replace(`/projects/${projectId}/thread/${result.thread_id}?new=true`);
      } catch (error) {
        console.error('[NewThreadPage] Failed to pre-create thread:', error);
      }
    }

    preCreateThread();
    return () => {
      isMounted = false;
    };
  }, [projectId, router]);

  // Always show the empty state UI with tempThreadId
  // until the real thread is created and adopted.
  return (
    <ThreadComponent
      projectId={projectId}
      threadId={resolvedThreadId || tempThreadId}
      isNew
    />
  );
}
