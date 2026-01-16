/**
 * 'recoder web status' command
 * Show current project link and sync status
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';
import { RecoderWebService } from '../../services/RecoderWebService.js';

interface StatusArgs {
  directory?: string;
}

export const statusCommand: CommandModule<{}, StatusArgs> = {
  command: 'status',
  describe: 'Show project link and sync status',
  builder: (yargs) =>
    yargs.option('directory', {
      type: 'string',
      alias: 'd',
      description: 'Directory to check (defaults to current directory)',
      default: process.cwd(),
    }),
  handler: async (argv) => {
    const authService = new RecoderAuthService();
    const webService = new RecoderWebService();

    try {
      const targetDir = path.resolve(argv.directory || process.cwd());

      // Check authentication
      const isAuth = await authService.isAuthenticated();
      const user = isAuth ? await authService.getUser() : null;

      // Check for project link
      let metadata: any = null;
      try {
        const metadataPath = path.join(targetDir, '.recoder-web');
        metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      } catch {}

      console.log('\n┌────────────────────────────────────────────────┐');
      console.log('│  📊 Recoder Platform Status                    │');
      console.log('├────────────────────────────────────────────────┤');

      // Auth status
      if (isAuth && user) {
        console.log(`│  👤 Account: ${user.email.slice(0, 32).padEnd(32)}│`);
        console.log(`│  📋 Plan: ${user.subscription_plan.toUpperCase().padEnd(35)}│`);
      } else {
        console.log('│  👤 Account: Not logged in                     │');
        console.log('│  💡 Run: recoder auth login                    │');
      }

      console.log('├────────────────────────────────────────────────┤');

      // Project link status
      if (metadata?.urlId || metadata?.projectId) {
        const projectId = metadata.urlId || metadata.projectId;
        console.log(`│  🔗 Linked: Yes                                │`);
        console.log(`│  📁 Project: ${projectId.slice(0, 32).padEnd(32)}│`);
        
        if (metadata.linkedAt) {
          const linkedDate = new Date(metadata.linkedAt).toLocaleDateString();
          console.log(`│  📅 Linked: ${linkedDate.padEnd(33)}│`);
        }

        if (metadata.lastSync) {
          const syncDate = new Date(metadata.lastSync).toLocaleString();
          console.log(`│  🔄 Last sync: ${syncDate.slice(0, 30).padEnd(30)}│`);
        }

        console.log('├────────────────────────────────────────────────┤');
        console.log(`│  🌐 Web: ${(metadata.webUrl || '').slice(0, 36).padEnd(36)}│`);
        console.log(`│  👁️  Preview: ${(metadata.previewUrl || '').slice(0, 31).padEnd(31)}│`);

        // Check for local changes
        if (isAuth) {
          try {
            const project = await webService.getProject(projectId);
            const localFiles = await webService.scanDirectory(targetDir);
            const remoteFiles = project.fileSnapshot || {};
            const changes = await webService.detectChanges(localFiles, remoteFiles);

            const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;
            
            console.log('├────────────────────────────────────────────────┤');
            if (totalChanges === 0) {
              console.log('│  ✅ Status: In sync                            │');
            } else {
              console.log(`│  ⚠️  Status: ${totalChanges} pending changes`.padEnd(47) + '│');
              if (changes.added.length > 0) {
                console.log(`│     + ${changes.added.length} new files`.padEnd(44) + '│');
              }
              if (changes.modified.length > 0) {
                console.log(`│     ~ ${changes.modified.length} modified`.padEnd(44) + '│');
              }
              if (changes.deleted.length > 0) {
                console.log(`│     - ${changes.deleted.length} deleted`.padEnd(44) + '│');
              }
            }
          } catch {
            console.log('├────────────────────────────────────────────────┤');
            console.log('│  ⚠️  Could not fetch remote status             │');
          }
        }
      } else {
        console.log('│  🔗 Linked: No                                 │');
        console.log('│  💡 Run: recoder web link <projectId>          │');
      }

      console.log('└────────────────────────────────────────────────┘\n');

    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  },
};
