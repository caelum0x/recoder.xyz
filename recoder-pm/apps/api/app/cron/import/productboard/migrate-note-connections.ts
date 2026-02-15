import { database } from "@repo/backend/database";
import type { Prisma, ProductboardImport } from "@repo/backend/prisma/client";
import { createClient } from "@repo/productboard";

type ImportJobProperties = Pick<
  ProductboardImport,
  "creatorId" | "organizationId" | "token"
>;

const createBuckets = <T>(items: T[], size: number) => {
  const bucketCount = Math.ceil(items.length / size);

  if (bucketCount === 0) {
    return [];
  }

  return Array.from({ length: bucketCount }).map((_, index) =>
    items.filter((_item, itemIndex) => itemIndex % bucketCount === index)
  );
};

const fetchNotes = async (token: string) => {
  const productboard = createClient({ accessToken: token });

  const notes = await productboard.GET("/notes", {
    params: {
      header: {
        "X-Version": 1,
      },
    },
  });

  if (notes.error) {
    throw new Error(notes.error.errors?.source?.join(", ") ?? "Unknown error");
  }

  if (!notes.data) {
    throw new Error("No notes found");
  }

  return notes.data.data;
};

type NotesData = Awaited<ReturnType<typeof fetchNotes>>;

const findOrganizationWithRelations = (organizationId: string) =>
  database.organization.findUnique({
    where: { id: organizationId },
    select: {
      feedback: {
        where: { productboardId: { not: null } },
        select: { id: true, productboardId: true },
      },
      features: {
        where: { productboardId: { not: null } },
        select: {
          id: true,
          productboardId: true,
          feedback: {
            select: {
              feedbackId: true,
            },
          },
        },
      },
    },
  });

type DatabaseOrganization = NonNullable<
  Awaited<ReturnType<typeof findOrganizationWithRelations>>
>;

const getLinkedFeatureIds = (note: NotesData[number]) =>
  note.features?.map(({ id }) => id) ?? [];

const hasFeedbackConnection = (
  feature: DatabaseOrganization["features"][number],
  feedbackId: string
) =>
  feature.feedback.some((connection) => connection.feedbackId === feedbackId);

const buildTransactions = ({
  notes,
  databaseOrganization,
  organizationId,
  creatorId,
}: {
  notes: NotesData;
  databaseOrganization: DatabaseOrganization;
  organizationId: string;
  creatorId: string;
}) => {
  const featureByProductboardId = new Map(
    databaseOrganization.features
      .filter((feature) => feature.productboardId)
      .map((feature) => [feature.productboardId as string, feature])
  );

  const transactions: Prisma.PrismaPromise<unknown>[] = [];
  const noteById = new Map(notes.map((note) => [note.id, note]));

  for (const feedback of databaseOrganization.feedback) {
    const originalNote = noteById.get(feedback.productboardId ?? "");

    if (!originalNote) {
      continue;
    }

    const noteLinkedFeatures = getLinkedFeatureIds(originalNote);

    if (!noteLinkedFeatures?.length) {
      continue;
    }

    for (const featureId of noteLinkedFeatures) {
      const feature = featureByProductboardId.get(featureId);

      if (!feature || hasFeedbackConnection(feature, feedback.id)) {
        continue;
      }

      transactions.push(
        database.feedbackFeatureLink.create({
          data: {
            creatorId,
            feedbackId: feedback.id,
            featureId: feature.id,
            organizationId,
            createdAt: originalNote.createdAt,
          },
        })
      );
    }
  }

  return transactions;
};

export const migrateNoteConnections = async ({
  token,
  organizationId,
  creatorId,
}: ImportJobProperties): Promise<number> => {
  const notesData = await fetchNotes(token);

  const databaseOrganization =
    await findOrganizationWithRelations(organizationId);

  if (!databaseOrganization) {
    throw new Error("Could not find organization");
  }

  const transactions = buildTransactions({
    notes: notesData,
    databaseOrganization,
    organizationId,
    creatorId,
  });

  // Each bucket should have 50 transactions max
  const buckets = createBuckets(transactions, 50);

  // Run database transactions sequentially to avoid deadlocks
  for (const bucket of buckets) {
    await database.$transaction(bucket);
  }

  return transactions.length;
};
