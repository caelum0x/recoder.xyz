"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { runOpportunityScoring } from "@/actions/opportunity-scoring/run";

export const RunScoringButton = () => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await runOpportunityScoring();

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Opportunity scoring queued.");

      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button disabled={loading} onClick={handleRun}>
      {loading ? "Calculating..." : "Recalculate"}
    </Button>
  );
};
