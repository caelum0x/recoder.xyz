// Owned by Recoder. Slack inbound event shapes the adapter normalizes. Ported
// verbatim from the real extracted `slack/types.ts` (SlackMessageEvent,
// SlackAppMentionEvent, SlackFile) so the adapter does not depend on the
// excluded gateway tree. These mirror the payloads the real `@slack/bolt`
// `app.event("message")` / `app.event("app_mention")` handlers receive.

export interface SlackFile {
  id?: string;
  name?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

export interface SlackMessageEvent {
  type: "message";
  user?: string;
  bot_id?: string;
  subtype?: string;
  username?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  event_ts?: string;
  parent_user_id?: string;
  channel: string;
  channel_type?: "im" | "mpim" | "channel" | "group";
  files?: SlackFile[];
}

export interface SlackAppMentionEvent {
  type: "app_mention";
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  event_ts?: string;
  parent_user_id?: string;
  channel: string;
  channel_type?: "im" | "mpim" | "channel" | "group";
}

export type SlackInboundEvent = SlackMessageEvent | SlackAppMentionEvent;
