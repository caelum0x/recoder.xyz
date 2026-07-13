// Owned by Recoder. Rebrands the OpenClaw gateway identity to Recoder. The
// original extracted code read OPENCLAW_* environment variables; the owned
// connectors package reads RECODER_CONNECTORS_* (with OPENCLAW_* honored only as
// a deprecated fallback so existing deployments keep working during migration).

/** Product identity for the connectors / social-gateway package. */
export const RECODER_CONNECTORS = {
  product: "Recoder",
  package: "@recoder/connectors",
  subsystem: "connectors",
} as const;

/**
 * Read a Recoder connectors env var, falling back to the legacy OPENCLAW_*
 * name when the RECODER_* one is unset. Returns undefined when neither is set.
 */
export function readConnectorEnv(name: string): string | undefined {
  const recoderKey = `RECODER_CONNECTORS_${name}`;
  const legacyKey = `OPENCLAW_${name}`;
  return process.env[recoderKey] ?? process.env[legacyKey];
}

/** Resolve the connectors gateway token (RECODER_CONNECTORS_GATEWAY_TOKEN). */
export function resolveGatewayToken(): string | undefined {
  return readConnectorEnv("GATEWAY_TOKEN");
}

/** Resolve the connectors config path (RECODER_CONNECTORS_CONFIG_PATH). */
export function resolveConfigPath(): string | undefined {
  return readConnectorEnv("CONFIG_PATH");
}

/** Subsystem logger tag used across the connectors package. */
export function subsystemTag(area: string): string {
  return `${RECODER_CONNECTORS.subsystem}/${area}`;
}
