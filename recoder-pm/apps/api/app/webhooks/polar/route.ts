import { Webhooks } from "@polar-sh/nextjs";
import { database } from "@repo/backend/database";
import { log } from "@repo/observability/log";
import { env } from "@/env";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const POST = Webhooks({
  webhookSecret: env.POLAR_WEBHOOK_SECRET,

  onOrderCreated: async (payload) => {
    const order = payload.data;
    const organizationId = order.metadata.organizationId as string | undefined;

    if (!organizationId) {
      log.warn("Polar order missing organizationId in metadata");
      return;
    }

    await database.organization.update({
      where: { id: organizationId },
      data: {
        polarCustomerId: order.customerId,
        polarSubscriptionId: order.subscriptionId,
      },
      select: { id: true },
    });

    log.info(
      `Polar order created for organization ${organizationId}, subscription ${order.subscriptionId}`
    );
  },

  onSubscriptionUpdated: async (payload) => {
    const subscription = payload.data;

    if (subscription.status === "canceled") {
      const organization = await database.organization.findFirst({
        where: { polarSubscriptionId: subscription.id },
        select: { id: true },
      });

      if (!organization) {
        log.warn(
          `No organization found for Polar subscription ${subscription.id}`
        );
        return;
      }

      await database.organization.update({
        where: { id: organization.id },
        data: { polarSubscriptionId: null },
        select: { id: true },
      });

      log.info(
        `Polar subscription ${subscription.id} canceled for organization ${organization.id}`
      );
    }
  },
});
