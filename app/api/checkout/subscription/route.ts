
import { dodopayments } from "@/lib/dodopayments";
import { getSession } from "@/lib/auth-helpers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const response = await dodopayments.subscriptions.create({
        billing: {
          city: "",
          country: "US",
          state: "",
          street: "",
          zipcode: "",
        },
        customer: {
          email: session.user.email,
          name: session.user.name || session.user.email,
        },
        payment_link: true,
        product_id: productId,
        quantity: 1,
        return_url: process.env.NEXT_PUBLIC_BASE_URL,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Checkout subscription error:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}
