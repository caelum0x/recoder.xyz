/**
 * `createDnsTlsVerifier` — the REAL {@link DomainVerifierPort} adapter that
 * closes the custom-domain activation loop. Without it, `DomainsService.verify`
 * has no prober injected and every custom domain stays `pending` forever (the
 * tenant sets the TXT record but nothing ever observes it).
 *
 * It performs two live checks against the tenant's hostname:
 *   1. OWNERSHIP — resolves the expected challenge `TXT` record(s) through
 *      `node:dns` `resolveTxt` and confirms the exact `recoder-verify=<token>`
 *      value is published. Every expected TXT must be observed.
 *   2. TLS — once ownership is proven, a `node:tls` probe (SNI to :443) reads the
 *      peer certificate and reports `active` only when a currently-valid cert is
 *      served (a real, not fabricated, ACME/edge-cert readiness signal).
 *
 * Degrade-safe law §37: both the resolver and the TLS probe are INJECTABLE and
 * this adapter NEVER throws across the boundary. A resolver miss (`ENOTFOUND`,
 * `ENODATA`) is a truthful `verified:false` with a machine reason; a resolver
 * timeout / infra fault is a truthful `verified:false` (never a fabricated
 * `verified`). TLS is only ever `active` when a valid cert is actually observed —
 * otherwise `pending` (ownership proven, cert not yet live) or `none` (not owned).
 */
import { promises as dnsPromises } from 'node:dns';
import tls from 'node:tls';
import type { Logger } from '../../../shared/logger.js';
import type { DomainVerifierPort, DomainVerifierResult } from '../services/domains.service.js';
import type { DnsRecord, TlsStatus } from '../types.js';

/** Resolve every TXT record for a name (each record is its concatenated chunks). */
export type ResolveTxtFn = (name: string) => Promise<string[]>;

/** Truthful TLS readiness for a hostname on :443 (never throws). */
export interface TlsProbeResult {
  /** A currently-valid certificate is being served for the hostname. */
  readonly valid: boolean;
  /** Why the cert is not valid/live (e.g. `handshake_failed`, `expired`). */
  readonly reason?: string;
}
export type TlsProbeFn = (hostname: string) => Promise<TlsProbeResult>;

export interface DnsTlsVerifierDeps {
  readonly logger: Logger;
  /** Injectable TXT resolver (default: `node:dns` `resolveTxt`, chunks joined). */
  readonly resolveTxt?: ResolveTxtFn;
  /** Injectable TLS prober (default: a `node:tls` SNI probe to :443). */
  readonly tlsProbe?: TlsProbeFn;
  /** Per-check timeout (ms) for the default TLS probe. Default 5000. */
  readonly tlsTimeoutMs?: number;
}

/** Default TXT resolver over `node:dns/promises` — joins the chunks of each record. */
const defaultResolveTxt: ResolveTxtFn = async (name: string): Promise<string[]> => {
  // `resolveTxt` returns string[][] (a record is split into <=255-char chunks).
  const records = await dnsPromises.resolveTxt(name);
  return records.map((chunks) => chunks.join(''));
};

/**
 * Default TLS probe: open a TLS connection with SNI to `hostname:443`, read the
 * peer certificate, and report `valid` only when a cert is served whose validity
 * window covers now. Never throws — a handshake error resolves to `valid:false`.
 */
function makeDefaultTlsProbe(timeoutMs: number): TlsProbeFn {
  return (hostname: string): Promise<TlsProbeResult> =>
    new Promise<TlsProbeResult>((resolvePromise) => {
      let settled = false;
      const finish = (result: TlsProbeResult): void => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          /* already closed */
        }
        resolvePromise(result);
      };

      const socket = tls.connect(
        {
          host: hostname,
          port: 443,
          servername: hostname,
          // We do NOT fail the probe on an untrusted chain — we only report whether
          // a currently-valid cert is being served. `rejectUnauthorized:false` lets
          // us inspect the cert even mid-provisioning without throwing.
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        () => {
          const cert = socket.getPeerCertificate();
          if (!cert || Object.keys(cert).length === 0) {
            finish({ valid: false, reason: 'no_peer_certificate' });
            return;
          }
          const now = Date.now();
          const notBefore = Date.parse(cert.valid_from);
          const notAfter = Date.parse(cert.valid_to);
          if (Number.isFinite(notBefore) && now < notBefore) {
            finish({ valid: false, reason: 'cert_not_yet_valid' });
            return;
          }
          if (Number.isFinite(notAfter) && now > notAfter) {
            finish({ valid: false, reason: 'cert_expired' });
            return;
          }
          finish({ valid: true });
        },
      );
      socket.on('timeout', () => finish({ valid: false, reason: 'tls_timeout' }));
      socket.on('error', (err: Error) => finish({ valid: false, reason: `tls_error:${err.message}` }));
    });
}

export function createDnsTlsVerifier(deps: DnsTlsVerifierDeps): DomainVerifierPort {
  const { logger } = deps;
  const resolveTxt = deps.resolveTxt ?? defaultResolveTxt;
  const tlsProbe = deps.tlsProbe ?? makeDefaultTlsProbe(deps.tlsTimeoutMs ?? 5000);

  /** Is the exact `value` published as a TXT record at `name`? Never throws. */
  async function txtPublished(name: string, value: string): Promise<{ found: boolean; reason?: string }> {
    try {
      const observed = await resolveTxt(name);
      if (observed.some((v) => v.trim() === value.trim())) return { found: true };
      return { found: false, reason: 'txt_record_missing' };
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      // NXDOMAIN / no records are truthful "not yet published", not infra faults.
      if (code === 'ENOTFOUND' || code === 'ENODATA') return { found: false, reason: 'txt_record_missing' };
      logger.warn({ err: cause, name }, 'domain verify: TXT resolve failed');
      return { found: false, reason: `resolver_error:${code ?? 'unknown'}` };
    }
  }

  return {
    async verify(hostname: string, expected: readonly DnsRecord[]): Promise<DomainVerifierResult> {
      const txtChallenges = expected.filter((r) => r.type === 'TXT');
      if (txtChallenges.length === 0) {
        // No ownership challenge to check ⇒ never assert ownership.
        return { verified: false, tls: 'none', reason: 'no_txt_challenge' };
      }

      // Ownership requires EVERY expected TXT to be observed live.
      let firstMissReason: string | undefined;
      for (const record of txtChallenges) {
        const { found, reason } = await txtPublished(record.name, record.value);
        if (!found) {
          firstMissReason ??= reason;
        }
      }
      if (firstMissReason) {
        return { verified: false, tls: 'none', reason: firstMissReason };
      }

      // Ownership proven — now report the truthful TLS posture.
      let tls: TlsStatus = 'pending';
      let tlsReason: string | undefined;
      try {
        const probe = await tlsProbe(hostname);
        tls = probe.valid ? 'active' : 'pending';
        tlsReason = probe.valid ? undefined : probe.reason;
      } catch (cause) {
        // A prober that (against contract) threw ⇒ truthful `pending`, never faked.
        logger.warn({ err: cause, hostname }, 'domain verify: TLS probe threw — reporting pending');
        tls = 'pending';
        tlsReason = 'tls_probe_error';
      }

      return {
        verified: true,
        tls,
        ...(tls === 'active' ? {} : { reason: tlsReason ?? 'tls_pending' }),
      };
    },
  };
}
