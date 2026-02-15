"use client";

import { Dialog } from "@repo/design-system/components/precomposed/dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import type { RestEndpointMethodTypes } from "@repo/github";
import type { Team } from "@repo/linear";
import { useState } from "react";
import { sendProposalTasksToGitHub } from "@/actions/proposals/send-to-github";
import { sendProposalTasksToLinear } from "@/actions/proposals/send-to-linear";
import { GitHubRepoSelect } from "@/components/connect-form/github/github-repo-select";
import { LinearTeamSelect } from "@/components/connect-form/linear/linear-team-select";

type SendToTrackerDialogProps = {
  readonly proposalId: string;
  readonly type: "github" | "linear";
  readonly tasksCount: number;
  readonly tasks: { title: string }[];
};

export const SendToTrackerDialog = ({
  proposalId,
  type,
  tasksCount: _tasksCount,
  tasks,
}: SendToTrackerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<
    RestEndpointMethodTypes["apps"]["listReposAccessibleToInstallation"]["response"]["data"]["repositories"]
  >([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | undefined>();
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [results, setResults] = useState<{
    created: { href?: string; title: string }[];
    failed: { title: string; error: string }[];
  }>({ created: [], failed: [] });
  const [preview, setPreview] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>(
    tasks.map((task) => task.title)
  );
  const [filter, setFilter] = useState("");

  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(filter.toLowerCase())
  );

  const handlePreview = () => {
    try {
      if (type === "github") {
        const repo = repositories.find(
          (item) => `${item.id}` === selectedRepoId
        );

        if (!repo?.name) {
          throw new Error("Select a repository");
        }

        setPreview([
          `GitHub repo: ${repo.owner?.login}/${repo.name}`,
          `Tasks to create: ${selectedTasks.length}`,
        ]);
      } else {
        if (!selectedTeamId) {
          throw new Error("Select a team");
        }

        const team = teams.find((item) => item.id === selectedTeamId);
        setPreview([
          `Linear team: ${team?.name ?? selectedTeamId}`,
          `Tasks to create: ${selectedTasks.length}`,
        ]);
      }

      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  const handleSubmit = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const ok = handlePreview();

      if (!ok) {
        return;
      }
      if (type === "github") {
        const repo = repositories.find(
          (item) => `${item.id}` === selectedRepoId
        );

        if (!repo?.owner?.login) {
          throw new Error("Select a repository");
        }

        const response = await sendProposalTasksToGitHub({
          proposalId,
          owner: repo.owner.login,
          repo: repo.name,
          selectedTasks,
        });

        if ("error" in response) {
          throw new Error(response.error);
        }

        setResults({
          created: response.created ?? [],
          failed: response.failed ?? [],
        });
      } else {
        if (!selectedTeamId) {
          throw new Error("Select a team");
        }

        const response = await sendProposalTasksToLinear({
          proposalId,
          teamId: selectedTeamId,
          selectedTasks,
        });

        if ("error" in response) {
          throw new Error(response.error);
        }

        setResults({
          created: response.created ?? [],
          failed: response.failed ?? [],
        });
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const title = type === "github" ? "Send to GitHub" : "Send to Linear";
  const cta = loading ? "Sending..." : "Send tasks";

  return (
    <Dialog
      cta={cta}
      description="Create issues from the proposal task list."
      disabled={loading}
      modal={false}
      onClick={handleSubmit}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setResults({ created: [], failed: [] });
          setPreview([]);
        }
      }}
      open={open}
      title={title}
      trigger={
        <Button onClick={() => setOpen(true)} variant="outline">
          {title}
        </Button>
      }
    >
      <div className="space-y-4">
        {type === "github" ? (
          <GitHubRepoSelect
            onValueChange={setSelectedRepoId}
            repositories={repositories}
            setRepositories={setRepositories}
            value={selectedRepoId}
          />
        ) : (
          <LinearTeamSelect
            onValueChange={setSelectedTeamId}
            setTeams={setTeams}
            teams={teams}
            value={selectedTeamId}
          />
        )}
        <div className="rounded-lg border bg-muted p-3 text-muted-foreground text-xs">
          <p className="mb-2 font-medium text-foreground">Select tasks</p>
          <input
            className="w-full rounded-md border bg-background px-2 py-1 text-foreground text-xs"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter tasks..."
            value={filter}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => setSelectedTasks(tasks.map((task) => task.title))}
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              onClick={() => setSelectedTasks([])}
              type="button"
              variant="ghost"
            >
              Clear all
            </Button>
          </div>
          <div className="grid gap-2">
            {filteredTasks.map((task) => {
              const checked = selectedTasks.includes(task.title);

              return (
                <label className="flex items-center gap-2" key={task.title}>
                  <input
                    checked={checked}
                    onChange={() => {
                      setSelectedTasks((prev) =>
                        checked
                          ? prev.filter((item) => item !== task.title)
                          : [...prev, task.title]
                      );
                    }}
                    type="checkbox"
                  />
                  <span>{task.title}</span>
                </label>
              );
            })}
          </div>
        </div>
        <Button onClick={handlePreview} type="button" variant="ghost">
          Preview selection
        </Button>

        {preview.length > 0 ? (
          <div className="rounded-lg border bg-muted p-3 text-muted-foreground text-xs">
            <p className="mb-2 font-medium text-foreground">Preview</p>
            <ul className="list-disc pl-4">
              {preview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {results.created.length > 0 || results.failed.length > 0 ? (
          <div className="rounded-lg border bg-muted p-3 text-muted-foreground text-xs">
            {results.created.length > 0 ? (
              <>
                <p className="mb-2 font-medium text-foreground">
                  Created {results.created.length} issues:
                </p>
                <ul className="list-disc pl-4">
                  {results.created.map((item, index) => (
                    <li key={item.href ?? `${type}-created-${index}`}>
                      {item.href ?? item.title}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {results.failed.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 font-medium text-foreground">
                  Failed {results.failed.length} tasks:
                </p>
                <ul className="list-disc pl-4">
                  {results.failed.map((item, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list
                    <li key={`${type}-failed-${index}`}>
                      {item.title}: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
};
