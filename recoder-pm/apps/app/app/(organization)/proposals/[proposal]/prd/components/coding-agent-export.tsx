"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { exportCodingAgentPrompt } from "@/actions/proposals/export-coding-agent";

type CodingAgentExportProps = {
  readonly proposalId: string;
};

export const CodingAgentExport = ({ proposalId }: CodingAgentExportProps) => {
  const [loadingTarget, setLoadingTarget] = useState<
    "cursor" | "claude" | null
  >(null);

  const handleCopy = async (target: "cursor" | "claude") => {
    if (loadingTarget) {
      return;
    }

    setLoadingTarget(target);

    try {
      const response = await exportCodingAgentPrompt(proposalId, target);

      if ("error" in response) {
        throw new Error(response.error);
      }

      await navigator.clipboard.writeText(response.prompt);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingTarget(null);
    }
  };

  return (
    <div className="rounded-lg border bg-background p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Coding Agent Export</h2>
          <p className="text-muted-foreground text-sm">
            Copy a prompt tailored for Cursor or Claude Code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={loadingTarget !== null}
            onClick={() => handleCopy("cursor")}
            type="button"
            variant="outline"
          >
            {loadingTarget === "cursor" ? "Copying..." : "Copy for Cursor"}
          </Button>
          <Button
            disabled={loadingTarget !== null}
            onClick={() => handleCopy("claude")}
            type="button"
          >
            {loadingTarget === "claude" ? "Copying..." : "Copy for Claude Code"}
          </Button>
        </div>
      </div>
    </div>
  );
};
