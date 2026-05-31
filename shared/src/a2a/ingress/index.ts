// Crypto-free A2A ingress entrypoint.
//
// Re-exports only the envelope validator + invalid-envelope error builder from
// their self-contained source modules (neither imports node:crypto). This lets
// Turbopack consumers (e.g. recoder-agency, Next 16) import the shared ingress
// contract WITHOUT pulling the `@recoder/shared/a2a` barrel, which `export *`s
// node:crypto-using modules that Turbopack rejects. Directory-index path so the
// package-exports target resolves cleanly (bare-file .ts exports do not).
export {
	validateRecoderA2AEnvelope,
	type RecoderA2AEnvelope,
	type RecoderEnvelopeValidationIssue,
	type RecoderEnvelopeValidationOptions,
} from "../types";
export { buildInvalidA2AEnvelopeErrorResponse } from "../error-contract";
export type { A2AEnvelopeValidationIssue } from "../error-contract";
