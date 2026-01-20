/**
 * 'recoder web diff' command
 * Show differences between local and web project
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { RecoderWebService } from '../../services/RecoderWebService.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';

interface DiffArgs {
  urlId?: string;
  directory?: string;
  verbose?: boolean;
  'show-content'?: boolean;
}

const DOCKER_BACKEND_URL = process.env['RECODER_DOCKER_URL'] || 'https://docker.recoder.xyz';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const diffCommand: CommandModule<{}, DiffArgs> = {
  command: 'diff [urlId]',
  describe: 'Show differences between local and web project',
  builder: (yargs) =>
    yargs
      .positional('urlId', {
        type: 'string',
        description: 'Project URL ID (optional, will read from .recoder-web if present)',
      })
      .option('directory', {
        type: 'string',
        alias: 'd',
        description: 'Directory to compare (defaults to current directory)',
        default: process.cwd(),
      })
      .option('verbose', {
        type: 'boolean',
        alias: 'v',
        description: 'Show detailed diff for each file',
        default: false,
      })
      .option('show-content', {
        type: 'boolean',
        description: 'Show unified diff content for modified files',
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
          console.log('Usage: recoder web diff <urlId>');
          console.log('   Or run from a linked directory');
          process.exit(1);
        }
      }

      console.log(`Comparing project: ${urlId}`);
      console.log(`Local directory: ${targetDir}\n`);

      // Scan local files
      console.log('Scanning local files...');
      const localFiles = await webService.scanDirectory(targetDir);
      console.log(`Found ${Object.keys(localFiles).length} local files`);

      // Get token for backend request
      const token = await authService.getAccessToken();
      if (!token) {
        console.error('Failed to get access token');
        process.exit(1);
      }

      // Try to get diff from docker backend first (has unified diff support)
      let diffResult: {
        diff: { added: string[]; modified: string[]; deleted: string[]; unchanged: string[] };
        stats: { totalChanges: number; addedCount: number; modifiedCount: number; deletedCount: number };
        unifiedDiffs?: Record<string, string>;
        containerRunning?: boolean;
      } | null = null;

      try {
        const response = await fetch(`${DOCKER_BACKEND_URL}/api/sync/${urlId}/diff`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ localFiles }),
        });

        if (response.ok) {
          const data = await response.json() as typeof diffResult & { success: boolean };
          if (data?.success) {
            diffResult = data;
            if (data.containerRunning) {
              console.log('Comparing with running container');
            }
          }
        }
      } catch {
        // Docker backend not available
      }

      // Fall back to local comparison with web API
      if (!diffResult) {
        console.log('Fetching remote files from web API...');
        let remoteFiles: Record<string, string> = {};

        try {
          const project = await webService.getProject(urlId);
          remoteFiles = project.fileSnapshot || {};
        } catch (error: any) {
          console.error(`Failed to fetch project: ${error.message}`);
          process.exit(1);
        }

        const changes = await webService.detectChanges(localFiles, remoteFiles);

        diffResult = {
          diff: changes,
          stats: {
            totalChanges: changes.added.length + changes.modified.length + changes.deleted.length,
            addedCount: changes.added.length,
            modifiedCount: changes.modified.length,
            deletedCount: changes.deleted.length,
          },
        };
      }

      // Display results
      console.log('\n' + '='.repeat(60));
      console.log('                    DIFF SUMMARY');
      console.log('='.repeat(60));

      const { diff, stats } = diffResult;

      if (stats.totalChanges === 0) {
        console.log(`\n${colors.green}No differences - local and remote are in sync!${colors.reset}`);
        return;
      }

      // Summary box
      console.log(`
${colors.gray}+----------------------------------+${colors.reset}
${colors.gray}|${colors.reset}  ${colors.green}+ ${stats.addedCount} added${colors.reset}   (local only)      ${colors.gray}|${colors.reset}
${colors.gray}|${colors.reset}  ${colors.yellow}~ ${stats.modifiedCount} modified${colors.reset}               ${colors.gray}|${colors.reset}
${colors.gray}|${colors.reset}  ${colors.red}- ${stats.deletedCount} deleted${colors.reset}  (remote only)   ${colors.gray}|${colors.reset}
${colors.gray}+----------------------------------+${colors.reset}
`);

      // Added files (local only)
      if (diff.added.length > 0) {
        console.log(`${colors.green}Added (local only):${colors.reset}`);
        const toShow = argv.verbose ? diff.added : diff.added.slice(0, 15);
        for (const file of toShow) {
          console.log(`  ${colors.green}+${colors.reset} ${file}`);
        }
        if (!argv.verbose && diff.added.length > 15) {
          console.log(`  ${colors.gray}... and ${diff.added.length - 15} more${colors.reset}`);
        }
        console.log('');
      }

      // Modified files
      if (diff.modified.length > 0) {
        console.log(`${colors.yellow}Modified:${colors.reset}`);
        const toShow = argv.verbose ? diff.modified : diff.modified.slice(0, 15);
        for (const file of toShow) {
          console.log(`  ${colors.yellow}~${colors.reset} ${file}`);
        }
        if (!argv.verbose && diff.modified.length > 15) {
          console.log(`  ${colors.gray}... and ${diff.modified.length - 15} more${colors.reset}`);
        }
        console.log('');
      }

      // Deleted files (remote only)
      if (diff.deleted.length > 0) {
        console.log(`${colors.red}Deleted (remote only):${colors.reset}`);
        const toShow = argv.verbose ? diff.deleted : diff.deleted.slice(0, 15);
        for (const file of toShow) {
          console.log(`  ${colors.red}-${colors.reset} ${file}`);
        }
        if (!argv.verbose && diff.deleted.length > 15) {
          console.log(`  ${colors.gray}... and ${diff.deleted.length - 15} more${colors.reset}`);
        }
        console.log('');
      }

      // Show unified diffs if requested
      if (argv['show-content'] && diffResult.unifiedDiffs) {
        console.log('='.repeat(60));
        console.log('                  UNIFIED DIFFS');
        console.log('='.repeat(60));

        for (const [filePath, unifiedDiff] of Object.entries(diffResult.unifiedDiffs)) {
          console.log(`\n${colors.cyan}--- ${filePath} ---${colors.reset}`);
          // Color the diff output
          for (const line of unifiedDiff.split('\n')) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
              console.log(`${colors.green}${line}${colors.reset}`);
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              console.log(`${colors.red}${line}${colors.reset}`);
            } else if (line.startsWith('@@')) {
              console.log(`${colors.cyan}${line}${colors.reset}`);
            } else {
              console.log(line);
            }
          }
        }

        if (diff.modified.length > Object.keys(diffResult.unifiedDiffs).length) {
          console.log(`\n${colors.gray}(Showing first ${Object.keys(diffResult.unifiedDiffs).length} of ${diff.modified.length} modified files)${colors.reset}`);
        }
      }

      // Suggestions
      console.log('='.repeat(60));
      console.log('ACTIONS:');
      console.log('-'.repeat(60));

      if (diff.added.length > 0 || diff.modified.length > 0) {
        console.log(`  ${colors.blue}recoder web push${colors.reset}   - Upload local changes to web`);
      }
      if (diff.deleted.length > 0 || diff.modified.length > 0) {
        console.log(`  ${colors.blue}recoder web pull${colors.reset}   - Download remote changes to local`);
      }
      console.log(`  ${colors.blue}recoder web sync${colors.reset}   - Two-way sync`);

      if (!argv['show-content'] && diff.modified.length > 0) {
        console.log(`\n${colors.gray}Tip: Use --show-content to see unified diff of modified files${colors.reset}`);
      }
      if (!argv.verbose && stats.totalChanges > 15) {
        console.log(`${colors.gray}Tip: Use --verbose to see all changed files${colors.reset}`);
      }

    } catch (error: any) {
      console.error(`${error.message}`);
      process.exit(1);
    }
  },
};
