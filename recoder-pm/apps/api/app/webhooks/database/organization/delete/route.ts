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
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as DeletePayload;

    if (!body.old_record) {
      return new Response('Missing old_record in payload', { status: 400 });
    }

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
  } catch (error) {
    log.error('Organization delete webhook failed', { error });
    return new Response('Internal server error', { status: 500 });
  }
};
