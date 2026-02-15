"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { generateProposalTasks } from "@/actions/proposals/generate-tasks";

type TaskItem = {
  title: string;
  summary: string;
  acceptanceCriteria?: string[];
  labels?: string[];
  estimate?: number;
  priority?: "low" | "medium" | "high";
};

type TaskBreakdown = {
  tasks?: TaskItem[];
};

type TaskBreakdownProps = {
  readonly proposalId: string;
  readonly breakdown: TaskBreakdown | null;
  readonly updatedAt: Date | null;
};

export const TaskBreakdownSection = ({
  proposalId,
  breakdown,
  updatedAt,
}: TaskBreakdownProps) => {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await generateProposalTasks(proposalId);

      if ("error" in response) {
        throw new Error(response.error);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(breakdown ?? { tasks: [] }, null, 2)
      );
    } catch (error) {
      handleError(error);
    }
  };

  const tasks = breakdown?.tasks ?? [];

  return (
    <div className="rounded-lg border bg-background p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Task breakdown</h2>
          <p className="text-muted-foreground text-sm">
            {updatedAt
              ? `Updated ${updatedAt.toLocaleDateString()}`
              : "No task breakdown yet."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} type="button" variant="outline">
            Copy JSON
          </Button>
          <Button disabled={loading} onClick={handleGenerate} type="button">
            {loading ? "Generating..." : "Generate tasks"}
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">
          Generate tasks to break this PRD into actionable work items.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {tasks.map((task, index) => (
            <div
              className="rounded-lg border border-dashed p-4"
              key={`${task.title}-${index}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{task.title}</h3>
                <div className="text-muted-foreground text-xs">
                  {task.priority ? `Priority: ${task.priority}` : "Priority: —"}
                  {typeof task.estimate === "number"
                    ? ` · Estimate: ${task.estimate}`
                    : ""}
                </div>
              </div>
              <p className="mt-2 text-foreground/90 text-sm">{task.summary}</p>
              {task.labels?.length ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  Labels: {task.labels.join(", ")}
                </p>
              ) : null}
              {task.acceptanceCriteria?.length ? (
                <ul className="mt-3 list-disc pl-5 text-foreground/80 text-sm">
                  {task.acceptanceCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
