"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type ContradictionJobStatus = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type ContradictionsStatusProps = {
  readonly initialJob: ContradictionJobStatus | null;
};

const statusLabel = (status: ContradictionJobStatus["status"]) => {
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

export const ContradictionsStatus = ({
  initialJob,
}: ContradictionsStatusProps) => {
  const router = useRouter();
  const [job, setJob] = useState<ContradictionJobStatus | null>(initialJob);
  const lastStatusRef = useRef(job?.status ?? null);

  const label = useMemo(() => (job ? statusLabel(job.status) : "Idle"), [job]);

  const handleStatusTransition = useCallback(
    (nextJob: ContradictionJobStatus | null) => {
      if (!nextJob?.status || nextJob.status === lastStatusRef.current) {
        return;
      }

      if (nextJob.status === "SUCCEEDED") {
        toast.success("Contradictions updated.");
        router.refresh();
      } else if (nextJob.status === "FAILED") {
        toast.error("Contradictions run failed.", {
          description: nextJob.error ?? undefined,
        });
      }

      lastStatusRef.current = nextJob.status;
    },
    [router]
  );

  useEffect(() => {
    let mounted = true;

    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/ai-jobs/contradictions", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          job: ContradictionJobStatus | null;
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
  }, [handleStatusTransition]);

  return (
    <div className="rounded-lg border bg-background px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">Contradiction detector</div>
        <div className="text-muted-foreground">{label}</div>
      </div>
      {job?.status === "FAILED" && job.error ? (
        <p className="mt-2 text-muted-foreground text-xs">{job.error}</p>
      ) : null}
      {job ? null : (
        <p className="mt-2 text-muted-foreground text-xs">
          No runs yet. Trigger detection to surface contradictions.
        </p>
      )}
    </div>
  );
};
