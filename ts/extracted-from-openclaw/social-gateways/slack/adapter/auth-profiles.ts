// Owned by Recoder. Multi-account auth-profile resolution for the Slack
// connector adapter, ported from the real extracted `slack/accounts.ts` +
// `slack/token.ts` token-source logic. The original resolved tokens out of the
// OpenClaw `OpenClawConfig` tree (`channels.slack.accounts.*`); that monorepo
// config module was not part of the extraction, so this owns an equivalent,
// self-contained auth-profile store keyed by connector accountId. Behavior is
// the same shape: per-account bot/app tokens, env fallback for the default
// account, and a truthful token-source for diagnostics.

/** Default connector account id (mirrors gateway-core DEFAULT_ACCOUNT_ID). */
export const DEFAULT_SLACK_ACCOUNT_ID = "default";

/** Where a resolved token came from — surfaced truthfully, never faked. */
export type SlackTokenSource = "env" | "profile" | "none";

/** Slack ingress mode: Socket Mode (app token) or HTTP Events (signing secret). */
export type SlackIngressMode = "socket" | "http";

/** One configured Slack account's credentials + ingress settings. */
export interface SlackAuthProfile {
  /** Connector account id this profile binds to. */
  readonly accountId: string;
  /** Optional human-readable workspace label. */
  readonly name?: string;
  /** Slack bot token (xoxb-…) — required for any API call. */
  readonly botToken?: string;
  /** Slack app-level token (xapp-…) — required for Socket Mode ingress. */
  readonly appToken?: string;
  /** Slack signing secret — required for HTTP Events ingress. */
  readonly signingSecret?: string;
  /** Ingress mode for `monitor()`. Defaults to "socket". */
  readonly mode?: SlackIngressMode;
  /** Webhook path override for HTTP mode. */
  readonly webhookPath?: string;
  /** Whether this account participates in monitor/probe. Defaults true. */
  readonly enabled?: boolean;
  /** Max outbound chunk length (Slack hard cap is 4000). */
  readonly textChunkLimit?: number;
  /** Max media upload size in MiB. */
  readonly mediaMaxMb?: number;
}

/** A fully resolved account, with tokens and their truthful sources. */
export interface ResolvedSlackAuthProfile {
  readonly accountId: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly botToken?: string;
  readonly appToken?: string;
  readonly signingSecret?: string;
  readonly mode: SlackIngressMode;
  readonly webhookPath?: string;
  readonly botTokenSource: SlackTokenSource;
  readonly appTokenSource: SlackTokenSource;
  readonly textChunkLimit?: number;
  readonly mediaMaxMb?: number;
}

/** Normalize a raw Slack token string (ported from real `token.ts`). */
export function normalizeSlackToken(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAccountId(accountId?: string | null): string {
  const trimmed = accountId?.trim();
  return trimmed ? trimmed : DEFAULT_SLACK_ACCOUNT_ID;
}

/**
 * A registry of Slack auth profiles. Profiles are injected by the Recoder
 * control plane (the auth-profiles foundation); the default account also reads
 * `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` from the
 * environment, exactly like the real `resolveSlackAccount` did for the default
 * account. This is hostile-by-default: an unknown account resolves to a
 * disabled, token-less profile rather than throwing — callers decide.
 */
export class SlackAuthProfileStore {
  private readonly profiles = new Map<string, SlackAuthProfile>();

  constructor(profiles: readonly SlackAuthProfile[] = []) {
    for (const profile of profiles) {
      this.upsert(profile);
    }
  }

  /** Add or replace a profile (immutable input; stored normalized). */
  upsert(profile: SlackAuthProfile): void {
    const accountId = normalizeAccountId(profile.accountId);
    this.profiles.set(accountId, { ...profile, accountId });
  }

  /** All configured account ids, sorted, always including the default. */
  listAccountIds(): string[] {
    const ids = new Set<string>([DEFAULT_SLACK_ACCOUNT_ID, ...this.profiles.keys()]);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }

  /** Resolve one account, applying env fallback for the default account. */
  resolve(accountId?: string | null): ResolvedSlackAuthProfile {
    const id = normalizeAccountId(accountId);
    const profile = this.profiles.get(id);
    const allowEnv = id === DEFAULT_SLACK_ACCOUNT_ID;

    const envBot = allowEnv ? normalizeSlackToken(process.env.SLACK_BOT_TOKEN) : undefined;
    const envApp = allowEnv ? normalizeSlackToken(process.env.SLACK_APP_TOKEN) : undefined;
    const envSigning = allowEnv
      ? normalizeSlackToken(process.env.SLACK_SIGNING_SECRET)
      : undefined;

    const profileBot = normalizeSlackToken(profile?.botToken);
    const profileApp = normalizeSlackToken(profile?.appToken);
    const profileSigning = normalizeSlackToken(profile?.signingSecret);

    const botToken = profileBot ?? envBot;
    const appToken = profileApp ?? envApp;
    const signingSecret = profileSigning ?? envSigning;

    const botTokenSource: SlackTokenSource = profileBot ? "profile" : envBot ? "env" : "none";
    const appTokenSource: SlackTokenSource = profileApp ? "profile" : envApp ? "env" : "none";

    return {
      accountId: id,
      name: profile?.name?.trim() || undefined,
      enabled: profile?.enabled !== false,
      botToken,
      appToken,
      signingSecret,
      mode: profile?.mode ?? "socket",
      webhookPath: profile?.webhookPath?.trim() || undefined,
      botTokenSource,
      appTokenSource,
      textChunkLimit: profile?.textChunkLimit,
      mediaMaxMb: profile?.mediaMaxMb,
    };
  }

  /** Resolve and require a bot token, throwing a truthful error if absent. */
  requireBotToken(accountId?: string | null): {
    token: string;
    resolved: ResolvedSlackAuthProfile;
  } {
    const resolved = this.resolve(accountId);
    if (!resolved.botToken) {
      throw new Error(
        `Slack bot token missing for account "${resolved.accountId}" ` +
          `(set the account profile botToken, or SLACK_BOT_TOKEN for the default account).`,
      );
    }
    return { token: resolved.botToken, resolved };
  }
}
