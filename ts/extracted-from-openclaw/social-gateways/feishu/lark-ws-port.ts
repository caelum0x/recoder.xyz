// Owned by Recoder. The structural port over the REAL Feishu long-connection
// transport — `@larksuiteoapi/node-sdk`'s WSClient + EventDispatcher — that the
// extracted `monitor.ts` uses. The adapter drives this exact SDK surface
// (register `im.message.receive_v1`, `wsClient.start({ eventDispatcher })`) but
// loads the module dynamically so the connector type-checks without the SDK
// package being resolvable in this extraction, and fails fast with a truthful
// error when the SDK is not installed at runtime (interop §6: never fake a
// connection).

/** The subset of `Lark.EventDispatcher` the monitor uses. */
export interface LarkEventDispatcher {
  register(handlers: Record<string, (data: unknown) => void | Promise<void>>): LarkEventDispatcher;
}

/** The subset of `Lark.WSClient` the monitor uses. */
export interface LarkWsClient {
  start(opts: { eventDispatcher: LarkEventDispatcher }): Promise<void>;
}

/** The subset of the `@larksuiteoapi/node-sdk` module surface we depend on. */
export interface LarkSdkModule {
  EventDispatcher: new (opts: Record<string, unknown>) => LarkEventDispatcher;
  WSClient: new (opts: {
    appId: string;
    appSecret: string;
    domain?: string;
    loggerLevel?: unknown;
  }) => LarkWsClient;
  LoggerLevel: { info: unknown };
}

/** Override for tests / DI: supply a fake SDK module instead of importing. */
export type LarkSdkLoader = () => Promise<LarkSdkModule>;

let injectedLoader: LarkSdkLoader | undefined;

/** Inject a custom SDK loader (used by tests to drive monitor without the SDK). */
export function setLarkSdkLoader(loader: LarkSdkLoader | undefined): void {
  injectedLoader = loader;
}

/**
 * Load the real `@larksuiteoapi/node-sdk` module. The dynamic specifier is built
 * at runtime so the static type-checker does not try to resolve the (optional)
 * SDK package. Throws a truthful error if the SDK is not installed.
 */
export async function loadLarkSdk(): Promise<LarkSdkModule> {
  try {
    const mod = injectedLoader
      ? ((await injectedLoader()) as Partial<LarkSdkModule> & {
          default?: Partial<LarkSdkModule>;
        })
      : ((await import(
          /* @vite-ignore */ ["@larksuiteoapi", "node-sdk"].join("/")
        )) as Partial<LarkSdkModule> & { default?: Partial<LarkSdkModule> });
    const resolved = (mod.WSClient ? mod : mod.default) as Partial<LarkSdkModule> | undefined;
    if (!resolved?.WSClient || !resolved.EventDispatcher) {
      throw new Error("module loaded but WSClient/EventDispatcher are missing");
    }
    return resolved as LarkSdkModule;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Feishu monitor requires the '@larksuiteoapi/node-sdk' package for the ` +
        `long-connection transport, which is not available: ${reason}. ` +
        `Install it to enable inbound monitoring.`,
    );
  }
}
