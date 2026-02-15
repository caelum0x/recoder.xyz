"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { generateProposalsForOrganization } from "@/actions/proposals/generate";

export const GenerateProposalsButton = () => {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await generateProposalsForOrganization();

      if ("error" in response) {
        throw new Error(response.error);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button disabled={loading} onClick={handleGenerate}>
      {loading ? "Generating..." : "Generate proposals"}
    </Button>
  );
};
