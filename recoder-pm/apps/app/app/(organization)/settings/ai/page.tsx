import { currentOrganizationId } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import { Skeleton } from "@repo/design-system/components/precomposed/skeleton";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { AiProvider } from "@/actions/organization/update-ai-settings";
import { AiIndexingChart } from "./components/ai-indexing-chart";
import { AiPromptForm } from "./components/ai-prompt-form";
import { AiProviderForm } from "./components/ai-provider-form";

export const metadata: Metadata = createMetadata({
  title: "AI Settings",
  description: "AI settings for your organization.",
});

export const dynamic = "force-dynamic";
const AiSettings = async () => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    notFound();
  }

  const organization = await database.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      productDescription: true,
      aiProvider: true,
      aiModel: true,
      aiPrompt: true,
      aiProviderKeys: {
        where: { isActive: true },
        select: {
          provider: true,
          keyPrefix: true,
        },
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const provider = (organization.aiProvider ?? "openrouter") as AiProvider;
  const keyPrefix =
    organization.aiProviderKeys.find((key) => key.provider === provider)
      ?.keyPrefix ?? null;

  return (
    <div className="px-6 py-16">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <div className="grid gap-2">
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            AI Settings
          </h1>
          <p className="mt-2 mb-0 text-muted-foreground">
            Manage your organization&apos;s AI settings.
          </p>
        </div>
        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Provider</h2>
          <p className="text-muted-foreground text-sm">
            Select your default AI provider and configure a BYOK API key.
          </p>
          <div className="mt-4">
            <AiProviderForm
              keyPrefix={keyPrefix}
              model={organization.aiModel ?? ""}
              provider={provider}
            />
          </div>
        </div>
        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Custom Instructions</h2>
          <p className="text-muted-foreground text-sm">
            Add organization-level AI guidance (tone, preferences, formatting).
          </p>
          <div className="mt-4">
            <AiPromptForm defaultValue={organization.aiPrompt ?? ""} />
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-full max-h-[391px]" />}>
          <AiIndexingChart />
        </Suspense>
      </div>
    </div>
  );
};

export default AiSettings;
