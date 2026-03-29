import type { AtlassianInstallation } from "@repo/backend/prisma/client";
import { OrDivider } from "@/components/or-divider";
import { JiraIssueCreator } from "./jira-issue-creator";
import { JiraIssuePicker } from "./jira-issue-picker";

type JiraSelectorProperties = {
  readonly jiraAccessToken: AtlassianInstallation["accessToken"] | undefined;
};

export const JiraSelector = ({ jiraAccessToken }: JiraSelectorProperties) => {
  if (!jiraAccessToken) {
    return (
      <p className="text-muted-foreground text-sm">
        Jira is not configured. Please ask an admin to set up the Jira
        integration in Settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <JiraIssuePicker />
      <OrDivider />
      <JiraIssueCreator />
    </div>
  );
};
