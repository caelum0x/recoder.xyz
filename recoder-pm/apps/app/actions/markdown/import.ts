"use server";

import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import type { Prisma } from "@repo/backend/prisma/client";
import { markdownToContent } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { friendlyWords } from "friendlier-words";
import { database } from "@/lib/database";

type MarkdownChangelog = {
  title: string | string[] | undefined;
  content: string | undefined;
  createdAt: string | string[] | undefined;
  slug: string | string[] | undefined;
  tags: string | string[] | undefined;
};

const asDate = (value: string | string[] | undefined) =>
  typeof value === "string" ? new Date(value) : undefined;

const asString = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

const asTags = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : [];

const collectTagNames = (changelogs: MarkdownChangelog[]) => {
  const tags = new Set<string>();

  for (const changelog of changelogs) {
    for (const tag of asTags(changelog.tags)) {
      tags.add(tag);
    }
  }

  return tags;
};

const createBuckets = <T>(items: T[], size: number) => {
  const bucketCount = Math.ceil(items.length / size);

  if (bucketCount === 0) {
    return [];
  }

  return Array.from({ length: bucketCount }, () => [] as T[]).map(
    (_, bucketIndex) =>
      items.filter(
        (_item, itemIndex) => itemIndex % bucketCount === bucketIndex
      )
  );
};

export const importMarkdown = async (
  changelogs: MarkdownChangelog[]
): Promise<{
  error?: string;
}> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not authorized");
    }

    // Ensure all the tags are created first so we can link them
    const existingTags = await database.changelogTag.findMany();
    const allTags = collectTagNames(changelogs);

    const tagsToCreate = Array.from(allTags).filter(
      (tag) => !existingTags.some(({ name }) => name === tag)
    );

    await database.changelogTag.createMany({
      data: tagsToCreate.map((tag) => ({
        name: tag,
        organizationId,
        fromMarkdown: true,
      })),
      skipDuplicates: true,
    });

    const newTags = await database.changelogTag.findMany();
    const transactions: Prisma.PrismaPromise<unknown>[] = [];

    for (const changelog of changelogs) {
      const content = changelog.content
        ? await markdownToContent(changelog.content)
        : undefined;
      const tags = asTags(changelog.tags);

      const transaction = database.changelog.create({
        data: {
          organizationId,
          creatorId: user.id,
          fromMarkdown: true,
          status: "PUBLISHED",
          title: asString(changelog.title) ?? friendlyWords(),
          createdAt: asDate(changelog.createdAt),
          publishAt: asDate(changelog.createdAt),
          slug: asString(changelog.slug),
          content,
          tags: {
            connect: newTags
              .filter((tag) => tags.includes(tag.name))
              .map((tag) => ({ id: tag.id })),
          },
        },
      });

      transactions.push(transaction);
    }

    // Each bucket should have 15 transactions max
    const buckets = createBuckets(transactions, 15);

    // Run database transactions sequentially to avoid deadlocks
    for (const bucket of buckets) {
      await database.$transaction(bucket);
    }

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
