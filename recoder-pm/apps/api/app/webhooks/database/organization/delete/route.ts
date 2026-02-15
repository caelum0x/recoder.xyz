import type { Organization } from "@repo/backend/prisma/client";
import { log } from "@repo/observability/log";
import { polar } from "@repo/payments";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

type DeletePayload = {
  type: "DELETE";
  table: string;
  schema: string;
  record: null;
  old_record: Organization;
};

export const POST = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as DeletePayload;

  log.info(`Organization ${body.old_record.id} has been deleted`);

  if (body.old_record.polarSubscriptionId) {
    await polar.subscriptions.update({
      id: body.old_record.polarSubscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    log.info(
      `Polar subscription ${body.old_record.polarSubscriptionId} has been canceled`
    );
  }

  return new Response("Organization deleted", { status: 201 });
};
