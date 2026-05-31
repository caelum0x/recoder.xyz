/**
 * Runs Dashboard Page
 *
 * Surfaces the unified product path for an A2A task / run:
 * task -> artifact -> pr -> preview -> approval, rendered as a vertical
 * stepper from shared backend run history (not demo-only / per-page state).
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GitBranch, Search } from 'lucide-react';
import TaskTimeline from './components/TaskTimeline';

function RunsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTaskId = searchParams.get('taskId') ?? '';

  const [inputValue, setInputValue] = useState(initialTaskId);
  const [activeTaskId, setActiveTaskId] = useState(initialTaskId);

  // Keep the active task in sync when the URL changes (e.g. back/forward).
  useEffect(() => {
    const fromUrl = searchParams.get('taskId') ?? '';
    setActiveTaskId(fromUrl);
    setInputValue(fromUrl);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    setActiveTaskId(trimmed);
    if (trimmed) {
      router.replace(`/dashboard/runs?taskId=${encodeURIComponent(trimmed)}`);
    } else {
      router.replace('/dashboard/runs');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-8 py-12 max-w-3xl">
        <div className="flex items-center space-x-3 mb-2">
          <GitBranch className="w-6 h-6 text-orange-500" />
          <h1 className="text-3xl font-bold">Run Timeline</h1>
        </div>
        <p className="text-gray-400 mb-8">
          Follow a task end-to-end: task &rarr; artifact &rarr; PR &rarr; preview &rarr; approval.
        </p>

        <form onSubmit={handleSubmit} className="flex items-center gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter a task ID (e.g. task_abc123)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-sm font-medium transition-colors"
          >
            View
          </button>
        </form>

        {activeTaskId ? (
          <TaskTimeline taskId={activeTaskId} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
            Enter a task ID above to view its run timeline.
          </div>
        )}
      </div>
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RunsContent />
    </Suspense>
  );
}
