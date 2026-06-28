/**
 * @module recoder-envelope.guards
 *
 * Compile-time drift guards for the Recoder envelope Zod schemas.
 *
 * This module contains only `import type` declarations and type-level
 * assertions. It emits no runtime code and creates no runtime import cycle, so
 * it is safe even though it references both `../types` and `./recoder-envelope`
 * (which themselves form a one-way runtime dependency: `../types` -> here).
 *
 * If `../types.ts` changes a payload shape, an agent platform, an intent, or a
 * pinned version, one of the assertions below stops type-checking and `tsc`
 * fails -- guaranteeing the Zod schemas never silently drift from the canonical
 * TypeScript interfaces.
 *
 * There is no reason to import this module at runtime; importing it is a no-op.
 */
import type { RecoderPayload, RecoderA2AEnvelope, RecoderAgentPlatform, RecoderIntent } from '../types';
import type { RecoderPayloadInput, RecoderA2AEnvelopeInput, __PLATFORMS, __INTENTS, __ENVELOPE_VERSION, __PROTOCOL_VERSION } from './recoder-envelope';
/** Asserts `Expected extends Actual` at the type level. */
type AssertExtends<Actual, Expected extends Actual> = Expected;
type _PayloadCovers = AssertExtends<RecoderPayload, RecoderPayloadInput>;
type _PayloadCoveredBy = AssertExtends<RecoderPayloadInput, RecoderPayload>;
type _EnvelopeCoveredBy = AssertExtends<RecoderA2AEnvelope, RecoderA2AEnvelopeInput>;
type _PlatformCovers = AssertExtends<RecoderAgentPlatform, (typeof __PLATFORMS)[number]>;
type _PlatformCoveredBy = AssertExtends<(typeof __PLATFORMS)[number], RecoderAgentPlatform>;
type _IntentCovers = AssertExtends<RecoderIntent, (typeof __INTENTS)[number]>;
type _EnvelopeVersionMatch = AssertExtends<RecoderA2AEnvelope['envelopeVersion'], typeof __ENVELOPE_VERSION>;
type _ProtocolVersionMatch = AssertExtends<RecoderA2AEnvelope['protocolVersion'], typeof __PROTOCOL_VERSION>;
/** Aggregate of all guards so none is flagged as unused. */
export type __RecoderEnvelopeDriftGuards = [
    _PayloadCovers,
    _PayloadCoveredBy,
    _EnvelopeCoveredBy,
    _PlatformCovers,
    _PlatformCoveredBy,
    _IntentCovers,
    _EnvelopeVersionMatch,
    _ProtocolVersionMatch
];
export {};
