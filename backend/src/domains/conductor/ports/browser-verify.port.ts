/**
 * `BrowserVerifyRunner` — the conductor's consumer-owned seam onto the engines
 * browser-verification executor. The conductor preview verifier NEVER
 * value-imports the engines executor; bootstrap (the composition root) binds the
 * concrete `executeBrowserVerification` to this shape and injects it into
 * `createBrowserPreviewVerifier`.
 *
 * The type surface below is a type-only reach into the engines domain (erased at
 * build — the legal cross-domain seam); only the runtime VALUE crosses the
 * boundary, and it does so through injection at the composition root, so the
 * conductor holds no runtime value edge into engines.
 */
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type {
  BrowserVerificationRun,
  BrowserVerifyRequest,
} from '../../engines/adapters/sidecar/browser-verification.executor.js';

/**
 * Runs one browser verification (navigate → assert → screenshot → summary) over a
 * browser-use `EngineClientPort`. Structurally identical to the engines
 * `executeBrowserVerification`; bootstrap injects that function as the concrete
 * runner so the verifier keeps its exact prior behavior with zero value coupling.
 */
export type BrowserVerifyRunner = (
  client: EngineClientPort,
  request: BrowserVerifyRequest,
) => Promise<BrowserVerificationRun>;
