import { decryptApiKey, maskApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";
import { InstallZendesk } from "./components/install";
import { ManageZendesk } from "./components/manage";

export const metadata: Metadata = createMetadata({
  title: "Zendesk Integration",
  description: "Configure your Zendesk integration settings.",
});

const ZendeskSettings = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return notFound();
  }

  const installation = await database.zendeskInstallation.findUnique({
    where: { organizationId },
  });

  if (!installation) {
    return <InstallZendesk />;
  }

  let keyPreview: string | null = null;

  try {
    keyPreview = maskApiKey(decryptApiKey(installation.encryptedKey));
  } catch {
    keyPreview = null;
  }

  return (
    <ManageZendesk
      email={installation.email}
      keyPreview={keyPreview}
      lastSyncedAt={installation.lastSyncedAt}
      status={installation.status}
      subdomain={installation.subdomain}
    />
  );
};

export default ZendeskSettings;
