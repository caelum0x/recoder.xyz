import { Checkout } from "@polar-sh/nextjs";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { baseUrl } from "@repo/lib/consts";
import { parseError } from "@repo/lib/parse-error";
import type { NextRequest } from "next/server";
import { env } from "@/env";

export const GET = async (request: NextRequest): Promise<Response> => {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  try {
    if (!productId) {
      throw new Error("Product ID not found");
    }

    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("User or organization not found");
    }

    if (!user.email) {
      throw new Error("Email address not found");
    }

    const handler = Checkout({
      accessToken: env.POLAR_ACCESS_TOKEN,
      successUrl: `${baseUrl}/subscribe?success=true`,
      server: (env.POLAR_SERVER as "production" | "sandbox") || "production",
    });

    const checkoutUrl = new URL(request.url);
    checkoutUrl.searchParams.set("productId", productId);
    checkoutUrl.searchParams.set("customerEmail", user.email);
    checkoutUrl.searchParams.set(
      "metadata",
      JSON.stringify({ organizationId, userId: user.id })
    );

    const checkoutRequest = new Request(checkoutUrl.toString(), {
      method: "GET",
      headers: request.headers,
    }) as NextRequest;

    return handler(checkoutRequest);
  } catch (error) {
    const message = parseError(error);

    return new Response(message, { status: 500 });
  }
};
