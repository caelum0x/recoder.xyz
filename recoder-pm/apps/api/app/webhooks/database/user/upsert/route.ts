import type { User } from "@repo/backend/auth";
import { getUserName } from "@repo/backend/auth/format";
import { authAdmin } from "@repo/backend/auth/server";
import { database } from "@repo/backend/database";
import { log } from "@repo/observability/log";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

type UpdatePayload = {
  type: "UPDATE";
  table: string;
  schema: string;
  record: User;
  old_record: User;
};

type InsertPayload = {
  type: "INSERT";
  table: string;
  schema: string;
  record: User;
};

export const POST = async (request: Request): Promise<Response> => {
  const webhookSecret = request.headers.get('x-webhook-secret') ?? request.headers.get('authorization');
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as UpdatePayload | InsertPayload;

    log.info("User has been updated or inserted");

    if (!body.record) {
      return new Response('Missing record in payload', { status: 400 });
    }

    const user = await authAdmin.getUserById(body.record.id);
    const organizationId = body.record.user_metadata?.organization_id;

    if (!organizationId) {
      return new Response("No organization_id in user metadata", { status: 400 });
    }

    const organization = await database.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    if (!(user.email && organization)) {
      return new Response("User or organization not found", { status: 404 });
    }

    const userName = getUserName(user);
    const [, domain] = user.email.split("@");

    let feedbackOrganization = await database.feedbackOrganization.findFirst({
      where: {
        organizationId,
        domain,
        name: organization.name,
      },
      select: { id: true },
    });

    if (!feedbackOrganization) {
      feedbackOrganization = await database.feedbackOrganization.create({
        data: {
          name: organization.name,
          domain,
          organizationId,
        },
        select: { id: true },
      });
    }

    const existingFeedbackUser = await database.feedbackUser.findFirst({
      where: {
        email: user.email,
        organizationId,
      },
      select: { id: true },
    });

    if (!existingFeedbackUser) {
      await database.feedbackUser.create({
        data: {
          email: user.email,
          name: userName,
          imageUrl: user.user_metadata?.image_url ?? "",
          organizationId,
          feedbackOrganizationId: feedbackOrganization.id,
        },
        select: { id: true },
      });
    }

    return new Response("Membership updated", { status: 201 });
  } catch (error) {
    log.error('User upsert webhook failed', { error });
    return new Response('Internal server error', { status: 500 });
  }
};
