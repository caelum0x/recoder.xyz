"use client";

import { useState } from "react";
import { toast } from "sonner";

type RetryButtonProps = {
  readonly jobId: string;
};

export const RetryButton = ({ jobId }: RetryButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/ai-jobs/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to retry job");
      }

      toast.success("Job re-queued.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Retry failed", { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="rounded-md border px-2 py-1 text-muted-foreground text-xs hover:text-foreground"
      onClick={handleRetry}
      type="button"
    >
      {loading ? "Retrying..." : "Retry"}
    </button>
  );
};
