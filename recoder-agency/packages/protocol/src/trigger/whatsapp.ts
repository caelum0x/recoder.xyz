import { whatsappMessageReceivedEvent } from "@giselles-ai/trigger-registry";
import * as z from "zod/v4";

const Provider = z.literal("whatsapp");

const WhatsAppMessageReceivedEventData = z.object({
	id: z.literal(whatsappMessageReceivedEvent.id),
});

export const WhatsAppEventData = z.discriminatedUnion("id", [
	WhatsAppMessageReceivedEventData,
]);
export type WhatsAppEventData = z.infer<typeof WhatsAppEventData>;

export const WhatsAppEventConfiguration = z.object({
	provider: Provider,
	event: WhatsAppEventData,
	phoneNumberId: z.string(),
	businessAccountId: z.string(),
});
export type WhatsAppEventConfiguration = z.infer<
	typeof WhatsAppEventConfiguration
>;
