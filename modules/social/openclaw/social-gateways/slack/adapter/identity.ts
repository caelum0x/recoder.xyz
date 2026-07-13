// Owned by Recoder. User-facing identity for the Slack connector adapter.
// Rebrands the extracted OpenClaw gateway to Recoder where the name surfaces to
// a human (logs, error prefixes, default app display). The wire protocol with
// Slack is unchanged — only the Recoder-side identity strings are rebranded.

/** The connector kind string this adapter speaks (matches ConnectorKind). */
export const SLACK_CONNECTOR_KIND = "slack" as const;

/** Human-facing product name surfaced in logs/errors. */
export const RECODER_PRODUCT_NAME = "Recoder";

/** Default Slack webhook ingress path when an account does not override it. */
export const RECODER_SLACK_WEBHOOK_PATH = "/recoder/slack/events";

/** Prefix every Recoder-side Slack log line so operators can grep one source. */
export function recoderSlackLogPrefix(accountId: string): string {
  return `[${RECODER_PRODUCT_NAME} slack:${accountId}]`;
}
