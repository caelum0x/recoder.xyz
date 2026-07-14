/**
 * recoder-backend — process entrypoint (thin).
 *
 * Parses `.env`, calls `bootstrap.start()`, and handles top-level failures. All
 * composition (config, DI, express+express-ws, health, lifecycle) lives in
 * `bootstrap/`. This file intentionally contains NO domain logic — it is the
 * shell around the composition root.
 *
 * (Replaces the ~12.8k-line v1 monolith, which no longer boots.)
 */
import 'dotenv/config';
import { start } from './bootstrap/index.js';
import { rootLogger } from './shared/logger.js';

async function main(): Promise<void> {
  try {
    const handle = await start();
    rootLogger.info({ url: handle.url }, 'recoder-backend started');
  } catch (error) {
    rootLogger.fatal(
      { err: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      'recoder-backend failed to boot',
    );
    process.exit(1);
  }
}

void main();
