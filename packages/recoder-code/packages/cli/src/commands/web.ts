/**
 * Main 'recoder web' command module
 * Manages web IDE projects
 */

import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './web/list.js';
import { downloadCommand } from './web/download.js';
import { openCommand } from './web/open.js';
import { infoCommand } from './web/info.js';
import { pushCommand } from './web/push.js';
import { syncCommand } from './web/sync.js';
import { launchCommand } from './web/launch.js';
import { linkCommand } from './web/link.js';
import { unlinkCommand } from './web/unlink.js';
import { statusCommand } from './web/status.js';

export const webCommand: CommandModule = {
  command: 'web',
  describe: 'Manage projects from web IDE',
  builder: (yargs: Argv) =>
    yargs
      .command(launchCommand)
      .command(linkCommand)
      .command(unlinkCommand)
      .command(statusCommand)
      .command(listCommand)
      .command(downloadCommand)
      .command(openCommand)
      .command(infoCommand)
      .command(pushCommand)
      .command(syncCommand)
      .demandCommand(1, 'You need at least one command. Try: recoder web launch')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
