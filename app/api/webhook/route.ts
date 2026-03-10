import { Webhook } from "standardwebhooks";
import { headers } from "next/headers";
import { dodopayments } from "@/lib/dodopayments";


const webhook = new Webhook(process.env.DODO_PAYMENTS_WEBHOOK_KEY!);


export async function POST(request: Request) {
  const headersList =  await headers();

  try {
    const rawBody = await request.text();
    const webhookHeaders = {
      "webhook-id": headersList.get("webhook-id") || "",
      "webhook-signature": headersList.get("webhook-signature") || "",
      "webhook-timestamp": headersList.get("webhook-timestamp") || "",
    };
    await webhook.verify(rawBody, webhookHeaders);
    const payload = JSON.parse(rawBody);

    if (payload.data.payload_type === "Subscription") {
      switch (payload.type) {
        case "subscription.active":
          await dodopayments.subscriptions.retrieve(payload.data.subscription_id);
          break;
        case "subscription.failed":
          break;
        case "subscription.cancelled":
          break;
        case "subscription.renewed":
          break;
        case "subscription.on_hold":
          break
        default:
          break;
      }
    } else if (payload.data.payload_type === "Payment") {
        switch (payload.type) {
            case "payment.succeeded":
              await dodopayments.payments.retrieve(payload.data.payment_id)
              break;
            default:
                break;
        }
    }
    return Response.json(
      { message: "Webhook processed successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Webhook verification failed", error);
    return Response.json(
      { message: "Webhook verification failed" },
      { status: 401 }
    );
  }
}
