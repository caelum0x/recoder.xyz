import "server-only";
import { subDays } from "date-fns";
import { database } from "./database";
import { sendDataHealthAlertEmail } from "./email";

const STALE_DAYS = 7;

const isStale = (date: Date | null) => {
  if (!date) {
    return true;
  }
  return date < subDays(new Date(), STALE_DAYS);
};

const collectConnectorIssues = (
  analyticsConnectors: { status: string; provider: string }[],
  zendeskInstallations: { status: string; subdomain: string | null }[]
) => {
  const issues: string[] = [];
  const analyticsErrors = analyticsConnectors.filter(
    (connector) => connector.status === "ERROR"
  );
  const zendeskErrors = zendeskInstallations.filter(
    (installation) => installation.status === "ERROR"
  );

  if (analyticsErrors.length) {
    issues.push(
      `Analytics connector errors: ${analyticsErrors
        .map((connector) => connector.provider)
        .join(", ")}.`
    );
  }

  if (zendeskErrors.length) {
    issues.push(
      `Support connector errors: ${zendeskErrors
        .map((installation) => installation.subdomain ?? "Zendesk")
        .join(", ")}.`
    );
  }

  return issues;
};

const collectStalenessIssues = (input: {
  hasSessionRecordingProvider: boolean;
  hasAnalyticsConnectors: boolean;
  hasZendeskInstallations: boolean;
  analyticsOccurredAt: Date | null;
  sessionOccurredAt: Date | null;
  supportCreatedAt: Date | null;
}) => {
  const issues: string[] = [];

  if (input.hasAnalyticsConnectors && isStale(input.analyticsOccurredAt)) {
    issues.push("Analytics events look stale (no events in 7+ days).");
  }

  if (input.hasSessionRecordingProvider && isStale(input.sessionOccurredAt)) {
    issues.push("Session insights look stale (no insights in 7+ days).");
  }

  if (input.hasZendeskInstallations && isStale(input.supportCreatedAt)) {
    issues.push("Support tickets look stale (no tickets in 7+ days).");
  }

  return issues;
};

const sendIssueEmails = async (
  organizationId: string,
  organizationName: string,
  issues: string[]
) => {
  const recipients = await database.authUser.findMany({
    where: {
      organizationId,
      organizationRole: { in: ["ADMIN", "EDITOR"] },
    },
    select: { email: true },
  });

  if (!recipients.length) {
    return;
  }

  await Promise.all(
    recipients.map((recipient) =>
      sendDataHealthAlertEmail({
        to: recipient.email,
        organizationName,
        issues,
      })
    )
  );
};

const sendSlackIssueAlert = async (
  orgName: string,
  slackInstallation: {
    webhookUrl: string | null;
    dataHealthAlertsEnabled: boolean;
  } | null,
  issues: string[]
) => {
  if (
    !(
      slackInstallation?.webhookUrl && slackInstallation.dataHealthAlertsEnabled
    )
  ) {
    return;
  }

  await fetch(slackInstallation.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Recoder PM data health alert for *${orgName}*:\n• ${issues.join(
        "\n• "
      )}\nReview: /insights/data-health`,
    }),
  });
};

export const runDataHealthAlerts = async () => {
  const organizations = await database.organization.findMany({
    select: {
      id: true,
      name: true,
      sessionRecordingProvider: true,
    },
  });

  for (const org of organizations) {
    const [
      analyticsConnectors,
      zendeskInstallations,
      analyticsLatest,
      sessionLatest,
      supportLatest,
      slackInstallation,
    ] = await Promise.all([
      database.analyticsConnector.findMany({
        where: { organizationId: org.id },
        select: { status: true, provider: true },
      }),
      database.zendeskInstallation.findMany({
        where: { organizationId: org.id },
        select: { status: true, subdomain: true },
      }),
      database.analyticsEvent.findFirst({
        where: { organizationId: org.id },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      database.sessionRecordingInsight.findFirst({
        where: { organizationId: org.id },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      database.supportTicket.findFirst({
        where: { organizationId: org.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      database.slackInstallation.findFirst({
        where: { organizationId: org.id },
        select: { webhookUrl: true, dataHealthAlertsEnabled: true },
      }),
    ]);

    const issues = [
      ...collectConnectorIssues(analyticsConnectors, zendeskInstallations),
      ...collectStalenessIssues({
        hasSessionRecordingProvider: Boolean(org.sessionRecordingProvider),
        hasAnalyticsConnectors: analyticsConnectors.length > 0,
        hasZendeskInstallations: zendeskInstallations.length > 0,
        analyticsOccurredAt: analyticsLatest?.occurredAt ?? null,
        sessionOccurredAt: sessionLatest?.occurredAt ?? null,
        supportCreatedAt: supportLatest?.createdAt ?? null,
      }),
    ];

    if (!issues.length) {
      continue;
    }

    await sendIssueEmails(org.id, org.name, issues);
    await sendSlackIssueAlert(org.name, slackInstallation, issues);
  }
};
