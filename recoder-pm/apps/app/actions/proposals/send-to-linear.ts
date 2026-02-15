"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { getJsonColumnFromTable } from "@repo/backend/database";
import { contentToMarkdown } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { LinearClient } from "@repo/linear";
import { database } from "@/lib/database";

type SendToLinearPayload = {
  readonly proposalId: string;
  readonly teamId: string;
  readonly selectedTasks?: string[];
};

type TaskBreakdown = {
  tasks?: {
    title: string;
    summary: string;
    acceptanceCriteria?: string[];
  }[];
};

const selectTasks = (
  tasks: TaskBreakdown["tasks"],
  selectedTasks?: string[]
) => {
  const available = tasks ?? [];
  return selectedTasks?.length
    ? available.filter((task) => selectedTasks.includes(task.title))
    : available;
};

const buildIssueBody = ({
  proposalTitle,
  proposalDescription,
  taskSummary,
  acceptanceCriteria,
  prdMarkdown,
}: {
  proposalTitle: string;
  proposalDescription: string | null;
  taskSummary: string;
  acceptanceCriteria?: string[];
  prdMarkdown: string;
}) => {
  const bodyLines = [
    `Proposal: ${proposalTitle}`,
    proposalDescription,
    "",
    `Task summary: ${taskSummary}`,
  ];

  if (acceptanceCriteria?.length) {
    bodyLines.push("", "Acceptance criteria:");
    bodyLines.push(...acceptanceCriteria.map((item) => `- ${item}`));
  }

  if (prdMarkdown) {
    bodyLines.push("", "PRD:");
    bodyLines.push(prdMarkdown);
  }

  return bodyLines.join("\n");
};

export const sendProposalTasksToLinear = async ({
  proposalId,
  teamId,
  selectedTasks,
}: SendToLinearPayload) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const [installation, proposal] = await Promise.all([
      database.linearInstallation.findFirst({
        select: { apiKey: true },
      }),
      database.proposal.findFirst({
        where: { id: proposalId, organizationId },
        select: { title: true, description: true, taskBreakdown: true },
      }),
    ]);

    if (!installation) {
      throw new Error("Linear installation not found");
    }

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    const breakdown = (proposal.taskBreakdown ?? {}) as TaskBreakdown;
    const filtered = selectTasks(breakdown.tasks, selectedTasks);

    if (filtered.length === 0) {
      throw new Error("No tasks to send");
    }

    const linear = new LinearClient({
      apiKey: installation.apiKey,
    });

    const prdContent = await getJsonColumnFromTable(
      "proposal",
      "prdContent",
      proposalId
    );
    const prdMarkdown = prdContent ? await contentToMarkdown(prdContent) : "";

    const created: { id: string; href?: string; title: string }[] = [];
    const failed: { title: string; error: string }[] = [];

    for (const task of filtered.slice(0, 25)) {
      try {
        const response = await linear.createIssue({
          teamId,
          title: task.title,
          description: buildIssueBody({
            proposalTitle: proposal.title,
            proposalDescription: proposal.description,
            taskSummary: task.summary,
            acceptanceCriteria: task.acceptanceCriteria,
            prdMarkdown,
          }),
        });

        if (!response.success) {
          throw new Error("Issue not created");
        }

        const issue = await response.issue;

        if (issue) {
          created.push({ id: issue.id, href: issue.url, title: task.title });
        }
      } catch (error) {
        failed.push({
          title: task.title,
          error: parseError(error),
        });
      }
    }

    return { created, failed };
  } catch (error) {
    return { error: parseError(error) };
  }
};
