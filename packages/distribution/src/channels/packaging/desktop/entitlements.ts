/**
 * macOS hardened-runtime entitlements — ported from
 * apps/desktop/entitlements.mac.plist. Electron's bundled V8 needs JIT and
 * writable+executable memory; node-pty needs the inherit entitlement to fork a
 * shell; the app needs network-client to reach recoder.xyz.
 */
export const MAC_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.cs.allow-dyld-environment-variables',
  'com.apple.security.inherit',
  'com.apple.security.network.client',
  'com.apple.security.network.server',
] as const;

export type MacEntitlement = (typeof MAC_ENTITLEMENTS)[number];

/**
 * Render the entitlements as a macOS .plist. Output is byte-compatible with the
 * hardened-runtime plist the desktop build signs with (every entitlement true).
 */
export function renderEntitlementsPlist(
  entitlements: readonly MacEntitlement[] = MAC_ENTITLEMENTS,
): string {
  const keys = entitlements
    .map((key) => `\t<key>${key}</key>\n\t<true/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${keys}
</dict>
</plist>
`;
}
