"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type OpportunityJobStatus = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type OpportunitySyncStatusProps = {
  readonly initialJob: OpportunityJobStatus | null;
};

const statusLabel = (status: OpportunityJobStatus["status"]) => {
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

export const OpportunitySyncStatus = ({
  initialJob,
}: OpportunitySyncStatusProps) => {
  const router = useRouter();
  const [job, setJob] = useState<OpportunityJobStatus | null>(initialJob);
  const lastStatusRef = useRef(job?.status ?? null);

  const label = useMemo(() => (job ? statusLabel(job.status) : "Idle"), [job]);

  const handleStatusTransition = useCallback(
    (nextJob: OpportunityJobStatus | null) => {
      if (!nextJob?.status || nextJob.status === lastStatusRef.current) {
        return;
      }

      if (nextJob.status === "SUCCEEDED") {
        toast.success("Opportunity scoring updated.");
        router.refresh();
      } else if (nextJob.status === "FAILED") {
        toast.error("Opportunity scoring failed.", {
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
        const response = await fetch("/api/ai-jobs/opportunity", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          job: OpportunityJobStatus | null;
        };

        if (!mounted) {
          return;
        }

        const nextJob = result.job;
        setJob(nextJob);
        handleStatusTransition(nextJob);
      } catch {
        // ignore polling errors
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
        <div className="font-medium">Opportunity scoring</div>
        <div className="text-muted-foreground">{label}</div>
      </div>
      {job?.status === "FAILED" && job.error ? (
        <p className="mt-2 text-muted-foreground text-xs">{job.error}</p>
      ) : null}
      {job ? null : (
        <p className="mt-2 text-muted-foreground text-xs">
          No runs yet. Trigger scoring to update AI RICE for your features.
        </p>
      )}
    </div>
  );
};
