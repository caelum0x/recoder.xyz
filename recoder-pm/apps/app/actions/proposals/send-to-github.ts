"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { getJsonColumnFromTable } from "@repo/backend/database";
import { contentToMarkdown } from "@repo/editor/lib/tiptap";
import { createOctokit } from "@repo/github";
import { parseError } from "@repo/lib/parse-error";
import { database } from "@/lib/database";

type SendToGitHubPayload = {
  readonly proposalId: string;
  readonly owner: string;
  readonly repo: string;
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

export const sendProposalTasksToGitHub = async ({
  proposalId,
  owner,
  repo,
  selectedTasks,
}: SendToGitHubPayload) => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const [installation, proposal] = await Promise.all([
      database.gitHubInstallation.findFirst({
        select: { installationId: true },
      }),
      database.proposal.findFirst({
        where: { id: proposalId, organizationId },
        select: { title: true, description: true, taskBreakdown: true },
      }),
    ]);

    if (!installation) {
      throw new Error("GitHub installation not found");
    }

    if (!proposal) {
      throw new Error("Proposal not found");
    }

    const breakdown = (proposal.taskBreakdown ?? {}) as TaskBreakdown;
    const filtered = selectTasks(breakdown.tasks, selectedTasks);

    if (filtered.length === 0) {
      throw new Error("No tasks to send");
    }

    const octokit = createOctokit(installation.installationId);
    const prdContent = await getJsonColumnFromTable(
      "proposal",
      "prdContent",
      proposalId
    );
    const prdMarkdown = prdContent ? await contentToMarkdown(prdContent) : "";

    const created: {
      id: string;
      href?: string;
      number?: number;
      title: string;
    }[] = [];
    const failed: { title: string; error: string }[] = [];

    for (const task of filtered.slice(0, 25)) {
      try {
        const issue = await octokit.issues.create({
          owner,
          repo,
          title: task.title,
          body: buildIssueBody({
            proposalTitle: proposal.title,
            proposalDescription: proposal.description,
            taskSummary: task.summary,
            acceptanceCriteria: task.acceptanceCriteria,
            prdMarkdown,
          }),
          labels: ["recoder-pm"],
        });

        created.push({
          id: `${issue.data.id}`,
          href: issue.data.html_url,
          number: issue.data.number,
          title: task.title,
        });
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
