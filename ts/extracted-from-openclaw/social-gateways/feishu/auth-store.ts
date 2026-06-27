// Owned by Recoder. Multi-account credential resolution for the Feishu
// ConnectorPort, built on the auth-profiles foundation contract
// (src/agents/auth-profiles.ts). The extracted `accounts.ts` resolved accounts
// from the OpenClaw config tree (`../config/*`, `../routing/session-key.js`),
// which is not part of the extraction. This owns the same real resolution
// behavior — default account from FEISHU_APP_ID/FEISHU_APP_SECRET env, plus
// explicitly registered named accounts — without that missing tree.

import {
  type AuthProfileStore,
  type TokenCredential,
  AUTH_STORE_VERSION,
  selectNextProfileId,
} from "../../src/agents/auth-profiles.js";
import { readConnectorEnv } from "../../src/identity.js";
import type { FeishuCredentials } from "./rest-client.js";

/** The default account id when none is specified (mirrors DEFAULT_ACCOUNT_ID). */
export const DEFAULT_FEISHU_ACCOUNT_ID = "default";

/** A registered Feishu account: an account id bound to one app's credentials. */
export interface FeishuAccount {
  readonly accountId: string;
  readonly credentials: FeishuCredentials;
  /** Optional human-facing label (bot name / workspace). */
  readonly name?: string;
  readonly enabled: boolean;
}

/** Trim and lower-case-fold an account id; empty -> default. */
export function normalizeAccountId(id?: string | null): string {
  const trimmed = id?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_FEISHU_ACCOUNT_ID;
}

/**
 * Hostile-by-default multi-account registry for Feishu connector accounts.
 * Holds credentials in an auth-profiles-shaped store so the same rotation
 * primitive (`selectNextProfileId`) the embedded agents use applies here.
 * Immutable updates: every mutation returns through a fresh store object.
 */
export class FeishuAccountRegistry {
  #store: AuthProfileStore;
  /** Per-account metadata kept alongside the credential profile. */
  readonly #meta = new Map<string, { domain?: string; name?: string; enabled: boolean }>();

  constructor() {
    this.#store = {
      version: AUTH_STORE_VERSION,
      profiles: {},
      order: {},
      lastGood: {},
      usageStats: {},
    };
  }

  /**
   * Register (or replace) one Feishu account. Credentials are stored as a
   * `TokenCredential` whose `token` carries the encoded `appId:appSecret` pair;
   * we keep the structured form in `#meta` so nothing is parsed ambiguously.
   */
  register(account: FeishuAccount): void {
    const accountId = normalizeAccountId(account.accountId);
    const { appId, appSecret, domain } = account.credentials;
    if (!appId.trim() || !appSecret.trim()) {
      throw new Error(`Feishu account "${accountId}" is missing appId/appSecret`);
    }
    const profile: TokenCredential = {
      type: "token",
      provider: "feishu",
      // appSecret is the bearer-equivalent secret for the app; appId is public.
      token: appSecret,
      email: appId,
    };
    this.#store = {
      ...this.#store,
      profiles: { ...this.#store.profiles, [accountId]: profile },
    };
    this.#meta.set(accountId, {
      domain,
      name: account.name,
      enabled: account.enabled,
    });
  }

  /** Resolve a registered account by id, or undefined if unknown. */
  get(accountId?: string | null): FeishuAccount | undefined {
    const id = normalizeAccountId(accountId);
    const profile = this.#store.profiles[id];
    const meta = this.#meta.get(id);
    if (!profile || profile.type !== "token" || !meta) {
      return undefined;
    }
    return {
      accountId: id,
      credentials: {
        appId: profile.email ?? "",
        appSecret: profile.token,
        domain: meta.domain,
      },
      name: meta.name,
      enabled: meta.enabled,
    };
  }

  /** All registered, enabled account ids (for fan-out / health sweeps). */
  enabledAccountIds(): string[] {
    return Object.keys(this.#store.profiles).filter(
      (id) => this.#meta.get(id)?.enabled !== false,
    );
  }

  /**
   * Pick the next usable account id via the foundation rotation primitive
   * (honours order + cooldowns). Falls back to the default account id.
   */
  nextAccountId(now: number = Date.now()): string {
    return (
      selectNextProfileId(this.#store, "feishu", now) ??
      this.enabledAccountIds()[0] ??
      DEFAULT_FEISHU_ACCOUNT_ID
    );
  }
}

/**
 * Build a registry seeded from the environment: the default account is taken
 * from FEISHU_APP_ID / FEISHU_APP_SECRET (with the connectors RECODER_ /
 * OPENCLAW_ fallbacks via `readConnectorEnv` for the domain). Returns an empty
 * registry — truthfully empty, never faked — when no env credentials are set.
 */
export function registryFromEnv(): FeishuAccountRegistry {
  const registry = new FeishuAccountRegistry();
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (appId && appSecret) {
    registry.register({
      accountId: DEFAULT_FEISHU_ACCOUNT_ID,
      credentials: {
        appId,
        appSecret,
        domain: readConnectorEnv("FEISHU_DOMAIN") ?? process.env.FEISHU_DOMAIN?.trim(),
      },
      name: process.env.FEISHU_BOT_NAME?.trim() || undefined,
      enabled: true,
    });
  }
  return registry;
}
