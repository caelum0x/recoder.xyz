import { getJsonColumnFromTable } from "@repo/backend/database";
import type { Template as TemplateClass } from "@repo/backend/prisma/client";
import { Template } from "@/app/(organization)/features/[feature]/(notes)/components/template";
import { database } from "@/lib/database";
import { TemplateSettings } from "./template-settings";

type TemplateComponentProperties = {
  readonly id: TemplateClass["id"];
};

export const TemplateComponent = async ({
  id,
}: TemplateComponentProperties) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale Prisma client missing version field
  const template = await (database.template as any).findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      version: true,
    },
  }) as { id: string; title: string; description: string | null; version?: number } | null;

  if (!template) {
    return null;
  }

  const content = await getJsonColumnFromTable(
    "template",
    "content",
    template.id
  );

  const version = template.version ?? 1;

  return (
    <Template
      active={false}
      content={content}
      description={
        version > 1
          ? `v${version}${template.description ? ` — ${template.description}` : ""}`
          : template.description
      }
      id={template.id}
      title={template.title}
    >
      <TemplateSettings
        defaultDescription={template.description}
        defaultTitle={template.title}
        templateId={template.id}
      />
    </Template>
  );
};
