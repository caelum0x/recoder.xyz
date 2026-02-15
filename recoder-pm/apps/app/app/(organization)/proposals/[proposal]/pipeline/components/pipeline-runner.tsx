"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { runSpecToCodePipeline } from "@/actions/proposals/run-spec-pipeline";

type PipelineRunnerProps = {
  readonly proposalId: string;
  readonly hasPrd: boolean;
  readonly hasTasks: boolean;
};

type PipelinePayload = {
  prdText: string;
  tasks: {
    tasks?: {
      title: string;
      summary: string;
      acceptanceCriteria?: string[];
      labels?: string[];
      estimate?: number;
      priority?: "low" | "medium" | "high";
    }[];
  };
  cursorPrompt: string;
  claudePrompt: string;
  spec: Record<string, unknown>;
};

export const PipelineRunner = ({
  proposalId,
  hasPrd,
  hasTasks,
}: PipelineRunnerProps) => {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<PipelinePayload | null>(null);

  const handleRun = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await runSpecToCodePipeline(proposalId);

      if ("error" in response) {
        throw new Error(response.error);
      }

      setPayload(response.payload);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      handleError(error);
    }
  };

  const tasksCount =
    payload?.tasks?.tasks?.length ?? (hasTasks ? undefined : 0);

  return (
    <div className="rounded-lg border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">Pipeline Run</h2>
          <p className="text-muted-foreground text-sm">
            Generate the PRD, tasks, and export artifacts in one pass.
          </p>
          <div className="text-muted-foreground text-xs">
            <div>PRD: {hasPrd ? "Ready" : "Missing"}</div>
            <div>
              Task breakdown: {hasTasks ? "Ready" : "Missing"}
              {typeof tasksCount === "number" ? ` (${tasksCount} tasks)` : ""}
            </div>
          </div>
        </div>
        <Button disabled={loading} onClick={handleRun} type="button">
          {loading ? "Running..." : "Run pipeline"}
        </Button>
      </div>

      {payload ? (
        <div className="mt-6 grid gap-4">
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">Spec JSON</p>
              <Button
                onClick={() =>
                  handleCopy(JSON.stringify(payload.spec, null, 2))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Copy JSON
              </Button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap text-foreground text-xs">
              {JSON.stringify(payload.spec, null, 2)}
            </pre>
          </div>

          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">Cursor Prompt</p>
              <Button
                onClick={() => handleCopy(payload.cursorPrompt)}
                size="sm"
                type="button"
                variant="outline"
              >
                Copy Prompt
              </Button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap text-foreground text-xs">
              {payload.cursorPrompt}
            </pre>
          </div>

          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">Claude Code Prompt</p>
              <Button
                onClick={() => handleCopy(payload.claudePrompt)}
                size="sm"
                type="button"
                variant="outline"
              >
                Copy Prompt
              </Button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap text-foreground text-xs">
              {payload.claudePrompt}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
};
