/**
 * Apple notarization port. Backed by `notarytool` via @electron/notarize in the
 * real adapter. Degrade-safe by construction: when credentials are absent the
 * caller skips (a normal local build); when credentials ARE present a failure
 * is a real release defect and must surface.
 */
export interface NotarizePort {
  /** Submit a signed .app for notarization and staple the ticket. */
  notarize(input: { appPath: string }): Promise<{ stapled: true }>;
}
