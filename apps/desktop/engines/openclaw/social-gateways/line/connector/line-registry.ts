// Owned by Recoder. The account registry the LINE ConnectorPort adapter resolves
// credentials through. The control plane configures one or more LINE accounts
// (channel access token + channel secret, or files/env) and the adapter looks
// each one up by `accountId` for monitor/send/probe. This is the connector's
// multi-account foundation surface for LINE.

import {
  DEFAULT_ACCOUNT_ID,
  listLineAccountIds,
  normalizeAccountId,
  resolveLineAccount,
  type LineConnectorConfig,
  type ResolvedLineAccount,
} from "./line-accounts.js";

/**
 * Holds the LINE channel config (base account + named sub-accounts) and resolves
 * per-account credentials on demand. Immutable: `withConfig` returns a new
 * registry rather than mutating in place (foundation immutability rule).
 */
export class LineAccountRegistry {
  private readonly config: LineConnectorConfig;

  constructor(config: LineConnectorConfig = {}) {
    this.config = config;
  }

  /** Return a new registry with the given config (no in-place mutation). */
  withConfig(config: LineConnectorConfig): LineAccountRegistry {
    return new LineAccountRegistry(config);
  }

  /** All configured account ids (default + named), env-aware. */
  listAccountIds(): string[] {
    const ids = listLineAccountIds(this.config);
    return ids.length > 0 ? ids : [DEFAULT_ACCOUNT_ID];
  }

  /** Resolve a single account's credentials and policy config. */
  resolve(accountId?: string): ResolvedLineAccount {
    return resolveLineAccount({ config: this.config, accountId });
  }

  /** Normalize an inbound/outbound account id to its canonical form. */
  normalizeId(accountId: string | undefined): string {
    return normalizeAccountId(accountId);
  }
}
