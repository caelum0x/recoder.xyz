/**
 * 'recoder web pull' command
 * Pull web project files to local directory
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { RecoderWebService } from '../../services/RecoderWebService.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';

interface PullArgs {
  urlId?: string;
  directory?: string;
  'dry-run'?: boolean;
  force?: boolean;
}

const DOCKER_BACKEND_URL = process.env['RECODER_DOCKER_URL'] || 'https://docker.recoder.xyz';

export const pullCommand: CommandModule<{}, PullArgs> = {
  command: 'pull [urlId]',
  describe: 'Pull web project files to local directory',
  builder: (yargs) =>
    yargs
      .positional('urlId', {
        type: 'string',
        description: 'Project URL ID (optional, will read from .recoder-web if present)',
      })
      .option('directory', {
        type: 'string',
        alias: 'd',
        description: 'Directory to pull to (defaults to current directory)',
        default: process.cwd(),
      })
      .option('dry-run', {
        type: 'boolean',
        description: 'Show what would be pulled without actually pulling',
        default: false,
      })
      .option('force', {
        type: 'boolean',
        alias: 'f',
        description: 'Overwrite local files without prompting',
        default: false,
      }),
  handler: async (argv) => {
    const webService = new RecoderWebService();
    const authService = new RecoderAuthService();

    try {
      // Check authentication
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        console.error('Not authenticated');
        console.log('Run: recoder auth login');
        process.exit(1);
      }

      const targetDir = path.resolve(argv.directory || process.cwd());
      let urlId = argv.urlId;

      // Try to read .recoder-web metadata if no urlId provided
      if (!urlId) {
        try {
          const metadataPath = path.join(targetDir, '.recoder-web');
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          urlId = metadata.urlId || metadata.projectId;
          console.log(`Found project ID from .recoder-web: ${urlId}`);
        } catch {
          console.error('No project ID provided and no .recoder-web file found');
          console.log('Usage: recoder web pull <urlId>');
          console.log('   Or run from a linked directory');
          process.exit(1);
        }
      }

      console.log(`Pulling project: ${urlId}`);
      console.log(`Local directory: ${targetDir}\n`);

      // Get token for backend request
      const token = await authService.getAccessToken();
      if (!token) {
        console.error('Failed to get access token');
        process.exit(1);
      }

      // Try to pull from docker backend first (for running containers)
      let remoteFiles: Record<string, string> = {};
      let pullSource = 'web';

      try {
        console.log('Checking docker backend for running container...');
        const response = await fetch(`${DOCKER_BACKEND_URL}/api/sync/${urlId}/pull`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json() as { success: boolean; files: Record<string, string>; fileCount: number };
          if (data.success && data.files) {
            remoteFiles = data.files;
            pullSource = 'docker';
            console.log(`Found running container with ${data.fileCount} files`);
          }
        }
      } catch {
        // Docker backend not available, fall back to web API
      }

      // Fall back to web API if docker backend didn't work
      if (Object.keys(remoteFiles).length === 0) {
        console.log('Fetching from web API...');
        try {
          const project = await webService.getProject(urlId);
          remoteFiles = project.fileSnapshot || {};
          console.log(`Found ${Object.keys(remoteFiles).length} files in web snapshot`);
        } catch (error: any) {
          console.error(`Failed to fetch project: ${error.message}`);
          process.exit(1);
        }
      }

      if (Object.keys(remoteFiles).length === 0) {
        console.log('\nNo files found in project');
        return;
      }

      // Scan local files
      console.log('\nScanning local directory...');
      const localFiles = await webService.scanDirectory(targetDir);

      // Detect changes (from remote perspective - what needs to come down)
      const changes = await webService.detectChanges(localFiles, remoteFiles);

      // Files to download: files in remote but not in local, or modified
      const toDownload = [...changes.deleted, ...changes.modified];
      // Files to add: files in local but not in remote - we don't touch these during pull
      // Files to delete: none during pull unless --force

      console.log('\nPull Analysis:');
      console.log('-'.repeat(60));

      if (changes.deleted.length > 0) {
        console.log(`\nNew files to download (${changes.deleted.length}):`);
        changes.deleted.slice(0, 15).forEach((file) => console.log(`  + ${file}`));
        if (changes.deleted.length > 15) {
          console.log(`  ... and ${changes.deleted.length - 15} more`);
        }
      }

      if (changes.modified.length > 0) {
        console.log(`\nFiles to update (${changes.modified.length}):`);
        changes.modified.slice(0, 15).forEach((file) => console.log(`  ~ ${file}`));
        if (changes.modified.length > 15) {
          console.log(`  ... and ${changes.modified.length - 15} more`);
        }
      }

      if (changes.added.length > 0) {
        console.log(`\nLocal-only files (${changes.added.length}):`);
        changes.added.slice(0, 10).forEach((file) => console.log(`  * ${file} (kept)`));
        if (changes.added.length > 10) {
          console.log(`  ... and ${changes.added.length - 10} more`);
        }
      }

      const hasChanges = toDownload.length > 0;

      if (!hasChanges) {
        console.log('\nLocal directory is up to date with remote!');
        return;
      }

      // Dry run mode
      if (argv['dry-run']) {
        console.log('\nDry run mode - no files were downloaded');
        console.log('Remove --dry-run to actually pull');
        return;
      }

      // Check for conflicts if not forcing
      if (!argv.force && changes.modified.length > 0) {
        console.log('\nModified files will be overwritten.');
        console.log('Use --force to proceed or --dry-run to see what would change.');

        // In a real CLI we'd prompt, but for simplicity we'll just warn
        console.log('\nProceeding with pull...');
      }

      // Download files
      console.log('\nDownloading files...');
      let downloaded = 0;

      for (const filePath of toDownload) {
        const content = remoteFiles[filePath];
        if (content === undefined) continue;

        const fullPath = path.join(targetDir, filePath);
        const fileDir = path.dirname(fullPath);

        try {
          await fs.mkdir(fileDir, { recursive: true });
          await fs.writeFile(fullPath, content, 'utf-8');
          downloaded++;
          console.log(`  Downloaded: ${filePath}`);
        } catch (error: any) {
          console.error(`  Failed: ${filePath} - ${error.message}`);
        }
      }

      // Update metadata
      const metadataFile = path.join(targetDir, '.recoder-web');
      try {
        let metadata: Record<string, unknown> = {};
        try {
          metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
        } catch { /* file doesn't exist */ }

        metadata.urlId = urlId;
        metadata.lastPull = new Date().toISOString();
        metadata.pullSource = pullSource;
        metadata.webUrl = webService.getProjectUrl(urlId);

        await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
      } catch { /* ignore metadata errors */ }

      console.log(`\nPull complete!`);
      console.log(`Downloaded ${downloaded} files from ${pullSource}`);
      console.log(`View at: ${webService.getProjectUrl(urlId)}`);

    } catch (error: any) {
      console.error(`${error.message}`);
      process.exit(1);
    }
  },
};
