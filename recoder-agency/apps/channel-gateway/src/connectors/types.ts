export type ProviderId = "slack" | "whatsapp" | "telegram" | "discord";

export type ConnectorConfigState =
	| { status: "ready" }
	| { status: "missing"; reason: string };

export interface Connector {
	provider: ProviderId;
	describeConfig(): ConnectorConfigState;
	verifySignature(request: {
		rawBody: Buffer;
		headers: Record<string, string | undefined>;
	}): Promise<boolean>;
	parseEvent(request: {
		rawBody: Buffer;
		headers: Record<string, string | undefined>;
	}): Promise<WebhookParseResult>;
}

export type WebhookParseResult = {
	event?: Record<string, unknown>;
	normalizedMessages?: NormalizedMessage[];
	immediateResponse?: {
		status: number;
		body: string;
		headers?: Record<string, string>;
	};
};

export type NormalizedMessage = {
	provider: ProviderId;
	messageId: string;
	threadId?: string;
	channelId: string;
	channelType?: string;
	senderId: string;
	senderDisplayName?: string;
	text: string;
	eventType?: string;
	rawEvent: Record<string, unknown>;
	receivedAt: string;
};
