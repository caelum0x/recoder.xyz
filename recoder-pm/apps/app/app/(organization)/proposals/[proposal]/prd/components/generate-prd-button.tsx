"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { toast } from "sonner";
import { generateProposalPrdAction } from "@/actions/proposals/generate-prd";

type GeneratePrdButtonProps = {
  readonly proposalId: string;
};

export const GeneratePrdButton = ({ proposalId }: GeneratePrdButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await generateProposalPrdAction(proposalId);

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("PRD generation queued.");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button disabled={loading} onClick={handleGenerate}>
      {loading ? "Generating..." : "Generate PRD"}
    </Button>
  );
};
