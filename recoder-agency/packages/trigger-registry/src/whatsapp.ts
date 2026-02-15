import z from "zod/v4";

interface WhatsAppEvent {
	id: string;
	label: string;
	payload: z.ZodObject;
}

export const whatsappMessageReceivedEvent = {
	id: "whatsapp.message.received",
	label: "Message Received",
	payload: z.object({
		from: z.string().meta({ label: "Sender Phone Number" }),
		body: z
			.string()
			.meta({ label: "Message Body", input: { multiline: true } }),
		timestamp: z.string().meta({ label: "Timestamp" }),
		mediaUrl: z.string().optional().meta({ label: "Media URL" }),
	}),
} as const satisfies WhatsAppEvent;

export const whatsappEvents = {
	[whatsappMessageReceivedEvent.id]: whatsappMessageReceivedEvent,
};

export type WhatsAppEventId = keyof typeof whatsappEvents;

export const whatsappEventEntries = Object.values(whatsappEvents);

export function isWhatsAppEventId(id: string): id is WhatsAppEventId {
	return id in whatsappEvents;
}
