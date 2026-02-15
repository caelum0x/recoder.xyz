import * as z from "zod/v4";

interface WhatsAppAction {
	id: string;
	label: string;
	payload: z.ZodObject;
}

export const whatsappSendMessageAction = {
	id: "whatsapp.send.message",
	label: "Send Message",
	payload: z.object({
		to: z.string().meta({ label: "Recipient Phone Number" }),
		body: z.string().meta({ label: "Message Body" }),
	}),
} as const satisfies WhatsAppAction;

export const whatsappSendMediaAction = {
	id: "whatsapp.send.media",
	label: "Send Media",
	payload: z.object({
		to: z.string().meta({ label: "Recipient Phone Number" }),
		mediaUrl: z.string().meta({ label: "Media URL" }),
		caption: z.string().optional().meta({ label: "Caption" }),
	}),
} as const satisfies WhatsAppAction;

export const whatsappActions = {
	[whatsappSendMessageAction.id]: whatsappSendMessageAction,
	[whatsappSendMediaAction.id]: whatsappSendMediaAction,
} as const;

export type WhatsAppActionId = keyof typeof whatsappActions;

export const whatsappActionEntries = Object.values(whatsappActions);

export function isWhatsAppActionId(id: string): id is WhatsAppActionId {
	return id in whatsappActions;
}
