// Owned by Recoder. The signal-cli receive-event wire shapes consumed by the
// adapter's normalize step. These types are extracted verbatim from
// social-gateways/signal/monitor/event-handler.types.ts — they describe the
// real JSON payload signal-cli emits on its `/api/v1/events` SSE `receive`
// frames. Re-declared here (rather than imported) so the adapter has zero
// dependency on the un-extracted monorepo modules the original module pulls in.

export interface SignalAttachment {
  readonly id?: string | null;
  readonly contentType?: string | null;
  readonly filename?: string | null;
  readonly size?: number | null;
}

export interface SignalGroupInfo {
  readonly groupId?: string | null;
  readonly groupName?: string | null;
}

export interface SignalReactionMessage {
  readonly emoji?: string | null;
  readonly targetAuthor?: string | null;
  readonly targetAuthorUuid?: string | null;
  readonly targetSentTimestamp?: number | null;
  readonly isRemove?: boolean | null;
  readonly groupInfo?: SignalGroupInfo | null;
}

export interface SignalDataMessage {
  readonly timestamp?: number;
  readonly message?: string | null;
  readonly attachments?: ReadonlyArray<SignalAttachment>;
  readonly groupInfo?: SignalGroupInfo | null;
  readonly quote?: { text?: string | null } | null;
  readonly reaction?: SignalReactionMessage | null;
}

export interface SignalEnvelope {
  readonly sourceNumber?: string | null;
  readonly sourceUuid?: string | null;
  readonly sourceName?: string | null;
  readonly timestamp?: number | null;
  readonly dataMessage?: SignalDataMessage | null;
  readonly editMessage?: { dataMessage?: SignalDataMessage | null } | null;
  readonly syncMessage?: unknown;
  readonly reactionMessage?: SignalReactionMessage | null;
}

export interface SignalReceivePayload {
  readonly envelope?: SignalEnvelope | null;
  readonly exception?: { message?: string } | null;
}
