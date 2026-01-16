/**
 * 'recoder web unlink' command
 * Remove link between current directory and recoder.xyz project
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';

interface UnlinkArgs {
  directory?: string;
}

export const unlinkCommand: CommandModule<{}, UnlinkArgs> = {
  command: 'unlink',
  describe: 'Remove link to recoder.xyz project',
  builder: (yargs) =>
    yargs.option('directory', {
      type: 'string',
      alias: 'd',
      description: 'Directory to unlink (defaults to current directory)',
      default: process.cwd(),
    }),
  handler: async (argv) => {
    try {
      const targetDir = path.resolve(argv.directory || process.cwd());
      const metadataFile = path.join(targetDir, '.recoder-web');

      try {
        await fs.access(metadataFile);
      } catch {
        console.log('📂 No project link found in this directory');
        return;
      }

      // Read metadata before deleting
      let projectId = 'unknown';
      try {
        const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
        projectId = metadata.urlId || metadata.projectId || 'unknown';
      } catch {}

      await fs.unlink(metadataFile);

      console.log('✅ Project unlinked successfully');
      console.log(`📁 Directory: ${targetDir}`);
      console.log(`🔗 Was linked to: ${projectId}`);
      console.log('\n💡 Run "recoder web link <projectId>" to link again');

    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  },
};
