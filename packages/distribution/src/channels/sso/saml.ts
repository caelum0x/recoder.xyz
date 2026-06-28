import type { DistributionError } from '../../errors/index';
import type { Result } from '../../result';
import { err } from '../../result';
import { DistributionError as DErr } from '../../errors/index';
import type { SsoIdentity } from './oidc-config';

/**
 * SAML 2.0 SSO contract.
 *
 * BLOCKED (intentionally not implemented here): a correct SAML assertion
 * verifier requires XML canonicalization (exclusive c14n), XML-DSig signature
 * verification, and XSW (XML signature wrapping) hardening — none of which can
 * be done safely with Node's stdlib alone, and which a half-implementation
 * would get WRONG in a way that silently accepts forged assertions. Rather than
 * ship a stub that fakes success, this surface returns an explicit
 * `provider_unavailable` denial until a vetted XML-DSig dependency is wired
 * behind it by the host.
 *
 * The CONTRACT (`SamlPort`) is defined now so an enterprise SAML IdP integration
 * is a single adapter add — symmetric with the OIDC path — and callers can code
 * against it today without branching on whether SAML exists yet.
 */
export interface SamlConfig {
  readonly orgId: string;
  /** The IdP entityID we trust (the `Issuer` of accepted assertions). */
  readonly idpEntityId: string;
  /** Our SP entityID (the `Audience` the assertion must be restricted to). */
  readonly spEntityId: string;
  /** PEM-encoded IdP signing certificate(s) used to verify the XML-DSig. */
  readonly idpCertsPem: readonly string[];
  readonly enabled: boolean;
}

export interface SamlPort {
  /**
   * Verify a base64 SAML Response and return the asserted identity. The contract
   * mirrors `SsoPort.verifyIdToken`: a verified identity or a deny `Result`,
   * never a faked success.
   */
  verifyAssertion(samlResponseB64: string): Promise<Result<SsoIdentity, DistributionError>>;
}

/** The blocked-note reason this adapter returns until XML-DSig is wired in. */
export const SAML_BLOCKED_REASON =
  'SAML assertion verification is not yet wired (requires a vetted XML-DSig/c14n dependency). ' +
  'Use OIDC, or wire a SamlPort adapter behind this contract. Returning explicit deny (never a faked allow).';

/**
 * The placeholder SAML adapter. It does NOT pretend to verify — it returns an
 * explicit `provider_unavailable` denial for every input, so an org that has
 * not completed SAML wiring fails safe rather than silently authenticating.
 */
export function createBlockedSamlPort(config: SamlConfig): SamlPort {
  return {
    async verifyAssertion() {
      return err(
        new DErr('provider_unavailable', SAML_BLOCKED_REASON, {
          orgId: config.orgId,
          idpEntityId: config.idpEntityId,
        }),
      );
    },
  };
}
