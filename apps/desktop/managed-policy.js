/**
 * Managed Policy — the signed, machine-scoped enterprise policy the desktop
 * reads before its first window. Fail-closed: an absent or invalid policy
 * yields conservative defaults, never a permissive/unlocked state. MDM overrides
 * user settings; this module only parses + validates. (Spec §3.10.)
 *
 * @typedef {Object} ManagedPolicy
 * @property {string[]} updateChannels   Allowlisted update channels (subset of stable|beta|enterprise).
 * @property {'embedded'|'self_host'|'fleet'} backendMode
 * @property {string|null} fleetEndpoint
 * @property {{enabled:boolean, otlpEndpoint:string|null, siemSink:string|null}} telemetry
 * @property {number} retentionDays
 * @property {Object} features           Feature gates; empty = nothing unlocked.
 * @property {'default'|'managed'} source
 */

const path = require('path');

const KNOWN_CHANNELS = ['stable', 'beta', 'enterprise'];
const KNOWN_BACKEND_MODES = ['embedded', 'self_host', 'fleet'];

/** @type {ManagedPolicy} */
const DEFAULT_POLICY = Object.freeze({
  updateChannels: Object.freeze(['stable']),
  backendMode: 'embedded',
  fleetEndpoint: null,
  telemetry: Object.freeze({ enabled: false, otlpEndpoint: null, siemSink: null }),
  retentionDays: 90,
  features: Object.freeze({}),
  source: 'default',
});

function toChannelAllowlist(value) {
  if (!Array.isArray(value)) return ['stable'];
  const filtered = value.filter((c) => KNOWN_CHANNELS.includes(c));
  return filtered.length > 0 ? filtered : ['stable'];
}

function toBackendMode(value) {
  return KNOWN_BACKEND_MODES.includes(value) ? value : 'embedded';
}

function toTelemetry(value) {
  const t = value && typeof value === 'object' ? value : {};
  return {
    enabled: t.enabled === true,
    otlpEndpoint: typeof t.otlpEndpoint === 'string' ? t.otlpEndpoint : null,
    siemSink: typeof t.siemSink === 'string' ? t.siemSink : null,
  };
}

function toRetentionDays(value) {
  return Number.isInteger(value) && value > 0 ? value : 90;
}

/**
 * Parse + validate a raw managed-policy object, fail-closed per field.
 * @param {unknown} raw
 * @returns {ManagedPolicy}
 */
function parseManagedPolicy(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_POLICY;
  const telemetry = toTelemetry(raw.telemetry);
  return Object.freeze({
    updateChannels: Object.freeze(toChannelAllowlist(raw.updateChannels)),
    backendMode: toBackendMode(raw.backendMode),
    fleetEndpoint: typeof raw.fleetEndpoint === 'string' ? raw.fleetEndpoint : null,
    telemetry: Object.freeze(telemetry),
    retentionDays: toRetentionDays(raw.retentionDays),
    features: Object.freeze(raw.features && typeof raw.features === 'object' ? { ...raw.features } : {}),
    source: 'managed',
  });
}

/**
 * The machine-scoped managed-policy location per OS.
 * @param {string} platform  process.platform value.
 * @returns {string}
 */
function managedPolicyPath(platform) {
  if (platform === 'darwin') {
    return '/Library/Managed Preferences/xyz.recoder.desktop.plist';
  }
  if (platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(programData, 'Recoder', 'managed-policy.json');
  }
  return '/etc/recoder/managed-policy.json';
}

/**
 * Load + parse the managed policy. Fail-closed: any read/parse error returns
 * DEFAULT_POLICY. Inject fs + platform for testability.
 * @param {{ readFileSync: (p: string) => string, platform: string }} deps
 * @returns {ManagedPolicy}
 */
function loadManagedPolicy(deps) {
  try {
    const raw = deps.readFileSync(managedPolicyPath(deps.platform));
    return parseManagedPolicy(JSON.parse(raw));
  } catch {
    return DEFAULT_POLICY;
  }
}

module.exports = { DEFAULT_POLICY, parseManagedPolicy, managedPolicyPath, loadManagedPolicy };
