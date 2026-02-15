export type TaskBreakdown = {
  readonly tasks?: {
    readonly title: string;
    readonly summary: string;
    readonly acceptanceCriteria?: string[];
    readonly labels?: string[];
    readonly estimate?: number;
    readonly priority?: "low" | "medium" | "high";
  }[];
};

const formatTasks = (breakdown: TaskBreakdown) => {
  const tasks = breakdown.tasks ?? [];

  return tasks
    .map((task, index) => {
      const lines = [`${index + 1}. ${task.title}`, `Summary: ${task.summary}`];

      if (task.acceptanceCriteria?.length) {
        lines.push(`Acceptance: ${task.acceptanceCriteria.join("; ")}`);
      }

      if (task.labels?.length) {
        lines.push(`Labels: ${task.labels.join(", ")}`);
      }

      if (typeof task.estimate === "number") {
        lines.push(`Estimate: ${task.estimate}`);
      }

      if (task.priority) {
        lines.push(`Priority: ${task.priority}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
};

export const buildCursorPrompt = (
  proposalTitle: string,
  prdText: string,
  breakdown: TaskBreakdown
) =>
  [
    "You are a coding agent working on the following PRD.",
    "Implement the tasks in order. Provide progress updates and code changes.",
    "",
    `PRD: ${proposalTitle}`,
    prdText,
    "",
    "Tasks:",
    formatTasks(breakdown),
  ].join("\n");

export const buildClaudeCodePrompt = (
  proposalTitle: string,
  prdText: string,
  breakdown: TaskBreakdown
) =>
  [
    "You are Claude Code. Implement this PRD in the repository.",
    "Follow the task list in order and note any open questions.",
    "",
    `PRD: ${proposalTitle}`,
    prdText,
    "",
    "Tasks:",
    formatTasks(breakdown),
  ].join("\n");
