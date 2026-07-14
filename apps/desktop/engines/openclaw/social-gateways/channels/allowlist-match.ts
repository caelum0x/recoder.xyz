// Owned by Recoder. The Discord gateway (and the other raw social-gateways) were
// extracted importing `../../channels/allowlist-match.js` — a sibling that the
// extraction did not carry over. Rather than duplicate the type, this re-points
// to the connectors FOUNDATION's already-extracted, verbatim copy
// (`src/gating/allowlist-match.ts`, itself extracted from
// gateway-core/channels/allowlist-match.ts). Single source of truth for the
// connector trust-boundary `AllowlistMatch` shape (interop §7.4: who may invoke
// the assistant).

export {
  type AllowlistMatch,
  type AllowlistMatchSource,
  formatAllowlistMatchMeta,
} from "../../src/gating/allowlist-match.js";
