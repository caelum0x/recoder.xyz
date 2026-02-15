"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type InsightJobStatus = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type SynthesisStatusProps = {
  readonly initialJob: InsightJobStatus | null;
  readonly active?: boolean;
};

const statusLabel = (status: InsightJobStatus["status"]) => {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "SUCCEEDED":
      return "Completed";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
};

export const SynthesisStatus = ({
  initialJob,
  active = true,
}: SynthesisStatusProps) => {
  const router = useRouter();
  const [job, setJob] = useState<InsightJobStatus | null>(initialJob);
  const lastStatusRef = useRef(job?.status ?? null);

  const label = useMemo(() => (job ? statusLabel(job.status) : "Idle"), [job]);

  const handleStatusTransition = useCallback(
    (nextJob: InsightJobStatus | null) => {
      if (!nextJob?.status || nextJob.status === lastStatusRef.current) {
        return;
      }

      if (nextJob.status === "SUCCEEDED") {
        toast.success("AI insights updated.");
        router.refresh();
      } else if (nextJob.status === "FAILED") {
        toast.error("AI insight synthesis failed.", {
          description: nextJob.error ?? undefined,
        });
      }

      lastStatusRef.current = nextJob.status;
    },
    [router]
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    let mounted = true;

    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/ai-jobs/insights", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          job: InsightJobStatus | null;
        };

        if (!mounted) {
          return;
        }

        const nextJob = result.job;
        setJob(nextJob);
        handleStatusTransition(nextJob);
      } catch {
        // ignore
      }
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [active, handleStatusTransition]);

  return (
    <div className="rounded-lg border bg-background px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">Insight synthesis</div>
        <div className="text-muted-foreground">{label}</div>
      </div>
      {job?.status === "FAILED" && job.error ? (
        <p className="mt-2 text-muted-foreground text-xs">{job.error}</p>
      ) : null}
      {job ? null : (
        <p className="mt-2 text-muted-foreground text-xs">
          No runs yet. Trigger a synthesis to generate new insights.
        </p>
      )}
    </div>
  );
};
