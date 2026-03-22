import "server-only";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { polar } from "@repo/payments";
import { env } from "@/env";
import { database } from "@/lib/database";

export type PlanName = "ENTERPRISE" | "FREE" | "PRO";

export const currentPlan = async (): Promise<PlanName> => {
  // BYOK platform — all users get PRO features (they bring their own AI keys)
  const byokMode = process.env.BYOK_MODE !== 'false';
  if (byokMode) {
    return "PRO";
  }

  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    throw new Error("Organization not found");
  }

  const databaseOrganization = await database.organization.findFirst({
    where: { id: organizationId },
  });

  if (!databaseOrganization) {
    throw new Error("Organization not found");
  }

  if (!databaseOrganization.polarSubscriptionId) {
    return "FREE";
  }

  const subscription = await polar.subscriptions.get({
    id: databaseOrganization.polarSubscriptionId,
  });

  const productId = subscription.productId;

  if (!productId) {
    return "FREE";
  }

  if (productId === env.POLAR_PRODUCT_ENTERPRISE_ID) {
    return "ENTERPRISE";
  }

  if (productId === env.POLAR_PRODUCT_PRO_ID) {
    return "PRO";
  }

  return "FREE";
};
