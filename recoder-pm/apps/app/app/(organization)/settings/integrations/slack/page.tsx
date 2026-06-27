import { currentOrganizationId } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { InstallSlack } from "./components/install";
import { ManageSlack } from "./components/manage";

export const metadata: Metadata = createMetadata({
  title: "Slack Integration",
  description: "Configure your Slack integration settings.",
});

export const dynamic = "force-dynamic";
const SlackIntegrationSettings = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const installation = await database.slackInstallation.findFirst({
    where: { organizationId },
    select: { id: true, dataHealthAlertsEnabled: true },
  });

  if (!installation) {
    return <InstallSlack />;
  }

  return (
    <ManageSlack
      dataHealthAlertsEnabled={installation.dataHealthAlertsEnabled}
      id={installation.id}
    />
  );
};

export default SlackIntegrationSettings;
