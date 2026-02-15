import { getMembers } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import type { Prisma, ProductboardImport } from "@repo/backend/prisma/client";
import { log } from "@repo/observability/log";
import { createClient } from "@repo/productboard";

type ImportJobProperties = Pick<
  ProductboardImport,
  "creatorId" | "organizationId" | "token"
>;

export const migrateCustomFieldValues = async ({
  token,
  organizationId,
}: ImportJobProperties): Promise<number> => {
  const [databaseOrganization, members] = await Promise.all([
    database.organization.findUnique({
      where: { id: organizationId },
      select: {
        featureCustomFields: {
          where: { productboardId: { not: null } },
          select: { productboardId: true, id: true },
        },
        features: { select: { productboardId: true, id: true } },
      },
    }),
    getMembers(organizationId),
  ]);

  if (!databaseOrganization) {
    throw new Error("Could not find organization");
  }

  const transactions: Prisma.PrismaPromise<unknown>[] = [];
  const productboard = createClient({ accessToken: token });

  const customFieldValuesPromises =
    databaseOrganization.featureCustomFields.map(async (customField) => {
      const response = await productboard.GET(
        "/hierarchy-entities/custom-fields-values",
        {
          params: {
            query: {
              "customField.id": customField.productboardId ?? "",
            },
            header: {
              "X-Version": 1,
            },
          },
        }
      );

      if (response.error) {
        throw new Error(
          response.error.errors.map((error) => error.detail).join(", ")
        );
      }

      if (!response.data) {
        throw new Error("No data returned");
      }

      return response.data.data;
    });

  const customFieldValuesRaw = await Promise.all(customFieldValuesPromises);
  const customFieldValues = customFieldValuesRaw.flat();
  log.info(
    `⏬ Migrating ${customFieldValues.length} values for ${databaseOrganization.featureCustomFields.length} custom fields`
  );

  const getMemberByEmail = (email: string): string | null =>
    members.find((member) => member.email === email)?.id ?? null;

  const featureByProductboardId = new Map(
    databaseOrganization.features
      .filter((feature) => feature.productboardId)
      .map((feature) => [feature.productboardId as string, feature.id])
  );
  const fieldByProductboardId = new Map(
    databaseOrganization.featureCustomFields
      .filter((field) => field.productboardId)
      .map((field) => [field.productboardId as string, field.id])
  );

  const featureCustomFields = customFieldValues.filter(
    (customFieldValue) => customFieldValue.hierarchyEntity.type === "feature"
  );

  for (const customFieldValue of featureCustomFields) {
    const featureId = featureByProductboardId.get(
      customFieldValue.hierarchyEntity.id
    );

    if (!featureId) {
      log.error(
        `Feature with Productboard ID ${customFieldValue.hierarchyEntity.id} not found`
      );
      continue;
    }

    const customFieldId = fieldByProductboardId.get(
      customFieldValue.customField.id
    );

    if (!customFieldId) {
      log.error(
        `Custom field with Productboard ID ${customFieldValue.customField.id} not found`
      );
      continue;
    }

    const parsedValue = (() => {
      switch (customFieldValue.type) {
        case "text":
        case "custom-description": {
          return customFieldValue.value;
        }
        case "number": {
          return customFieldValue.value?.toString() ?? null;
        }
        case "dropdown": {
          return customFieldValue.value?.id ?? null;
        }
        case "multi-dropdown": {
          return customFieldValue.value
            ? customFieldValue.value.map((option) => option?.id).join(", ")
            : null;
        }
        case "member": {
          return customFieldValue.value?.email
            ? getMemberByEmail(customFieldValue.value.email)
            : null;
        }
        default: {
          return null;
        }
      }
    })();

    if (parsedValue === null) {
      continue;
    }

    const transaction = database.featureCustomFieldValue.create({
      data: {
        value: parsedValue,
        featureId,
        customFieldId,
        organizationId,
      },
    });

    transactions.push(transaction);
  }

  await database.$transaction(transactions);

  return transactions.length;
};
