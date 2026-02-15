import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { polar } from "@repo/payments";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";

export const GET = async (): Promise<Response> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return new Response(null, { status: 404 });
  }

  const databaseOrganization = await database.organization.findFirst({
    where: { id: organizationId },
    select: { polarCustomerId: true },
  });

  if (!databaseOrganization) {
    return new Response(null, { status: 404 });
  }

  const { polarCustomerId } = databaseOrganization;

  if (!polarCustomerId) {
    return new Response(null, { status: 404 });
  }

  try {
    const session = await polar.customerSessions.create({
      customerId: polarCustomerId,
    });

    return NextResponse.redirect(session.customerPortalUrl, { status: 302 });
  } catch (error) {
    const message = parseError(error);

    return new Response(message, { status: 500 });
  }
};
