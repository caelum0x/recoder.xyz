import { Link } from "@repo/design-system/components/link";
import { StackCard } from "@repo/design-system/components/stack-card";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Image from "next/image";
import { database } from "@/lib/database";

const title = "Integrations";
const description = "Connect your favorite tools to Recoder PM.";

export const metadata: Metadata = createMetadata({
  title,
  description,
});

const IntegrationsSettings = async () => {
  const [
    jiraInstallation,
    gitHubInstallation,
    linearInstallation,
    slackInstallation,
    intercomInstallation,
    analyticsConnectors,
    zendeskInstallation,
    sessionRecordingProviders,
    zapierFeedbackRequests,
    zapierFeatureRequests,
  ] = await Promise.all([
    database.atlassianInstallation.count(),
    database.gitHubInstallation.count(),
    database.linearInstallation.count(),
    database.slackInstallation.count(),
    database.intercomInstallation.count(),
    database.analyticsConnector.count(),
    database.zendeskInstallation.count(),
    database.organization.count({
      where: { sessionRecordingProvider: { not: null } },
    }),
    database.feedback.count({
      where: { source: "ZAPIER" },
    }),
    database.feature.count({
      where: { source: "ZAPIER" },
    }),
  ]);

  const integrations = [
    {
      title: "Jira",
      description: "Two-way sync your Jira issues with Recoder PM features.",
      icon: "/jira.svg",
      installed: Boolean(jiraInstallation),
      installLink: "/settings/integrations/jira",
      configureLink: "/settings/integrations/jira",
    },

    {
      title: "GitHub",
      invert: true,
      description: "Sync with GitHub issues",
      icon: "/github.svg",
      installed: Boolean(gitHubInstallation),
      installLink: "/api/integrations/github/start",
      configureLink: "/settings/integrations/github",
    },
    {
      title: "Product Analytics",
      description: "Connect Mixpanel, Amplitude, or PostHog.",
      icon: "/analytics.svg",
      installed: Boolean(analyticsConnectors),
      installLink: "/settings/integrations/analytics",
      configureLink: "/settings/integrations/analytics",
    },
    {
      title: "Zapier",
      description: "Automate workflows with Zapier",
      icon: "/zapier.svg",
      installed: Boolean(zapierFeedbackRequests || zapierFeatureRequests),
      installLink: "https://zapier.com/apps/recoder-pm/integrations",
      configureLink: "https://zapier.com/app/zaps",
    },
    {
      title: "Linear",
      description: "Sync with Linear issues",
      icon: "/linear.svg",
      installed: Boolean(linearInstallation),
      installLink: "/settings/integrations/linear",
      configureLink: "/settings/integrations/linear",
    },
    {
      title: "Slack",
      description: "Send notifications to Slack.",
      icon: "/slack.svg",
      installed: Boolean(slackInstallation),
      installLink: "/settings/integrations/slack",
      configureLink: "/settings/integrations/slack",
    },
    {
      title: "Intercom",
      description: "Capture incoming feedback from Intercom.",
      icon: "/intercom.svg",
      installed: Boolean(intercomInstallation),
      installLink: "/settings/integrations/intercom",
      configureLink: "/settings/integrations/intercom",
    },
    {
      title: "Zendesk",
      description: "Import support tickets from Zendesk.",
      icon: "/zendesk.svg",
      installed: Boolean(zendeskInstallation),
      installLink: "/settings/integrations/zendesk",
      configureLink: "/settings/integrations/zendesk",
    },
    {
      title: "Session Recordings",
      description: "Import insights from FullStory or Hotjar.",
      icon: "/session-recordings.svg",
      installed: Boolean(sessionRecordingProviders),
      installLink: "/settings/integrations/session-recordings",
      configureLink: "/settings/integrations/session-recordings",
    },
    {
      title: "Recoder PM API",
      description: "Interface directly with Recoder PM",
      icon: "/recoder-pm.svg",
      installed: true,
      installLink: "/settings/api",
      configureLink: "/settings/api",
    },
    {
      title: "Email",
      invert: true,
      description: "Send feedback via email",
      icon: "/email.svg",
      installed: true,
      installLink: "/settings/integrations/email",
      configureLink: "/settings/integrations/email",
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-semibold text-4xl tracking-tight">{title}</h1>
        <p className="mb-0 text-muted-foreground">{description}</p>
      </div>

      <StackCard className="divide-y p-0">
        {integrations.map((integration) => (
          <div className="flex items-center gap-4 p-4" key={integration.title}>
            <Image
              alt={integration.title}
              className="m-0 h-8 w-8 shrink-0 object-contain"
              height={32}
              src={integration.icon}
              width={32}
            />
            <div className="block flex-1">
              <div className="flex items-center gap-1.5">
                <div className="block font-medium">{integration.title}</div>
                {!!integration.installed && (
                  <Badge variant="secondary">Installed</Badge>
                )}
              </div>
              <div className="block text-muted-foreground text-sm">
                {integration.description}
              </div>
            </div>
            {integration.installed ? (
              <Button
                asChild
                className="flex items-center gap-2"
                variant="outline"
              >
                <Link href={integration.configureLink}>Configure</Link>
              </Button>
            ) : (
              <Button
                asChild
                className="flex items-center gap-2"
                variant="outline"
              >
                <Link href={integration.installLink}>Install</Link>
              </Button>
            )}
          </div>
        ))}
      </StackCard>
    </div>
  );
};

export default IntegrationsSettings;
