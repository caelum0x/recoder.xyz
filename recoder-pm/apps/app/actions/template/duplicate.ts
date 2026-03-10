"use server";

import { RecoderPmRole } from "@repo/backend/auth";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { getJsonColumnFromTable } from "@repo/backend/database";
import type { Template } from "@repo/backend/prisma/client";
import { textToContent } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const duplicateTemplateAsNewVersion = async (
  templateId: Template["id"]
): Promise<{ id: string } | { error: string }> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not logged in");
    }

    if (user.user_metadata.organization_role === RecoderPmRole.Member) {
      throw new Error(
        "You don't have permission to duplicate templates for this organization"
      );
    }

    const source = await database.template.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        title: true,
        description: true,
        organizationId: true,
      },
    });

    if (!source) {
      throw new Error("Template not found");
    }

    if (source.organizationId !== organizationId) {
      throw new Error("Template does not belong to this organization");
    }

    const content = await getJsonColumnFromTable(
      "template",
      "content",
      source.id
    );

    // Find the highest version for this template lineage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale Prisma client missing version/parentTemplateId fields
    const siblings = await (database.template as any).findMany({
      where: {
        OR: [
          { id: templateId },
          { parentTemplateId: templateId },
        ],
      },
      select: { version: true },
      orderBy: { version: "desc" },
      take: 1,
    }) as Array<{ version: number }>;

    const nextVersion = (siblings[0]?.version ?? 1) + 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale Prisma client missing version/parentTemplateId fields
    const { id } = await (database.template as any).create({
      data: {
        title: `${source.title} (v${nextVersion})`,
        description: source.description,
        organizationId,
        creatorId: user.id,
        content: content ?? textToContent(""),
        version: nextVersion,
        parentTemplateId: templateId,
      },
      select: { id: true },
    }) as { id: string };

    revalidatePath("/settings/templates");
    return { id };
  } catch (error) {
    return { error: parseError(error) };
  }
};
