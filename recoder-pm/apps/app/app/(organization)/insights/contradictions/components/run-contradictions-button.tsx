"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { toast } from "sonner";
import { runContradictions } from "@/actions/contradictions/run";

export const RunContradictionsButton = () => {
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await runContradictions();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Contradictions run queued.");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button disabled={loading} onClick={handleRun}>
      {loading ? "Queuing..." : "Run detection"}
    </Button>
  );
};
