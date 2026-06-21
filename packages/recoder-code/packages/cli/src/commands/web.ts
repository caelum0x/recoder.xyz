/**
 * Main 'recoder web' command module
 * Manages web IDE projects
 */

import type { CommandModule, Argv } from 'yargs';
import { pullCommand } from './web/pull.js';
import { launchCommand } from './web/launch.js';
import { linkCommand } from './web/link.js';
import { unlinkCommand } from './web/unlink.js';
import { diffCommand } from './web/diff.js';
import { watchCommand } from './web/watch.js';

export const webCommand: CommandModule = {
  command: 'web',
  describe: 'Sync local projects with a running web IDE container',
  builder: (yargs: Argv) =>
    yargs
      .command(launchCommand)
      .command(linkCommand)
      .command(unlinkCommand)
      .command(pullCommand)
      .command(diffCommand)
      .command(watchCommand)
      .demandCommand(1, 'You need at least one command. Try: recoder web launch')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
