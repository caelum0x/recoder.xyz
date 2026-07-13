/**
 * recoder-social entrypoint — supervised boot:
 *
 *   1. load env config (fail fast on invalid values, no secrets in code)
 *   2. start the status HTTP listener FIRST (truthful state is always served)
 *   3. start the channel runtime (degrade-safe: per-channel failures become
 *      truthful status entries; zero configured channels is a valid state)
 *   4. handle SIGINT/SIGTERM with a graceful stop
 *
 * The host environment is injectable (RuntimeEnv) so the same boot can be
 * embedded/supervised without letting a child failure kill the host process.
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { loadSocialConfig } from './config.js';
import { startStatusServer, type StatusServer } from './health.js';
import { SocialRuntime, type RuntimeEnv } from './runtime.js';

function line(stream: NodeJS.WritableStream, level: string, message: string): void {
  stream.write(`${new Date().toISOString()} [recoder-social] ${level} ${message}\n`);
}

/** Default host env: timestamped lines on stdout/stderr. */
export const processEnv: RuntimeEnv = {
  log: (message) => line(process.stdout, 'info', message),
  error: (message) => line(process.stderr, 'error', message),
};

export interface SocialApp {
  readonly runtime: SocialRuntime;
  readonly status: StatusServer;
  stop(): Promise<void>;
}

/** Boot the app. Throws only when the config or the status port is unusable. */
export async function main(env: RuntimeEnv = processEnv): Promise<SocialApp> {
  const config = loadSocialConfig();
  const runtime = new SocialRuntime(config, { env });

  // Status first: even a fully unconfigured deployment serves honest state.
  const status = await startStatusServer({
    host: config.http.host,
    port: config.http.port,
    getStatus: () => runtime.status(),
    env,
  });

  try {
    await runtime.start();
  } catch (err) {
    // start() is contractually non-throwing; keep serving status regardless.
    env.error(`runtime start failed (serving status only): ${err instanceof Error ? err.message : String(err)}`);
  }

  const snapshot = runtime.status();
  const configured = snapshot.channels.filter((c) => c.configured);
  const connected = snapshot.channels.filter((c) => c.connected);
  if (configured.length === 0) {
    env.log('no channels configured — set channel credentials (e.g. TELEGRAM_BOT_TOKEN) to go live');
  } else {
    env.log(
      `channels: ${configured.length} configured, ${connected.length} live inbound ` +
        `(${connected.map((c) => c.channel).join(', ') || 'none'})`,
    );
  }
  env.log(`embedded reply agent: ${snapshot.agentEnabled ? 'enabled' : 'disabled (truthful no-runner mode)'}`);

  return {
    runtime,
    status,
    stop: async () => {
      await runtime.stop();
      await status.close();
    },
  };
}

function resolveDirectRun(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry === '') return false;
  try {
    // Node realpaths the main module (e.g. /tmp -> /private/tmp on macOS), so
    // compare against the realpath of argv[1], falling back to the raw path.
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

const isDirectRun = resolveDirectRun();

if (isDirectRun) {
  main()
    .then((app) => {
      const shutdown = (signal: string): void => {
        processEnv.log(`received ${signal}, shutting down`);
        app
          .stop()
          .then(() => process.exit(0))
          .catch((err) => {
            processEnv.error(`shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          });
      };
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      processEnv.error(`boot failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    });
}
