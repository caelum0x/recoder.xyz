/**
 * 'recoder web link' command
 * Link current directory to a recoder.xyz web project for real-time sync
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';
import { RecoderWebService } from '../../services/RecoderWebService.js';

interface LinkArgs {
  projectId?: string;
  directory?: string;
}

export const linkCommand: CommandModule<{}, LinkArgs> = {
  command: 'link [projectId]',
  describe: 'Link current directory to a recoder.xyz project for real-time sync',
  builder: (yargs) =>
    yargs
      .positional('projectId', {
        type: 'string',
        description: 'Project URL ID (e.g., abc123 from web.recoder.xyz/chat/abc123)',
      })
      .option('directory', {
        type: 'string',
        alias: 'd',
        description: 'Directory to link (defaults to current directory)',
        default: process.cwd(),
      }),
  handler: async (argv) => {
    const authService = new RecoderAuthService();
    const webService = new RecoderWebService();

    try {
      // Check authentication
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        console.error('❌ Not authenticated');
        console.log('💡 Run: recoder auth login');
        process.exit(1);
      }

      const targetDir = path.resolve(argv.directory || process.cwd());
      let projectId = argv.projectId;

      // If no projectId, try to read from existing .recoder-web
      if (!projectId) {
        try {
          const metadataPath = path.join(targetDir, '.recoder-web');
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          projectId = metadata.urlId || metadata.projectId;
          console.log(`📋 Found existing link: ${projectId}`);
        } catch {
          console.error('❌ No project ID provided');
          console.log('💡 Usage: recoder web link <projectId>');
          console.log('   Example: recoder web link abc123');
          console.log('\n📍 Get project ID from your recoder.xyz URL:');
          console.log('   https://web.recoder.xyz/chat/abc123 → projectId is "abc123"');
          process.exit(1);
        }
      }

      // Verify project exists
      console.log(`🔍 Verifying project: ${projectId}...`);
      let project;
      try {
        project = await webService.getProject(projectId);
      } catch {
        console.error(`❌ Project not found: ${projectId}`);
        console.log('💡 Make sure you have access to this project');
        process.exit(1);
      }

      // Create .recoder-web metadata file
      const metadataFile = path.join(targetDir, '.recoder-web');
      const metadata = {
        urlId: projectId,
        projectId: projectId,
        description: project.description || '',
        linkedAt: new Date().toISOString(),
        webUrl: webService.getProjectUrl(projectId),
        previewUrl: `https://docker.recoder.xyz/preview/${projectId}`,
        syncEnabled: true,
      };

      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');

      console.log('\n┌────────────────────────────────────────────────┐');
      console.log('│  ✅ Project Linked Successfully!               │');
      console.log('├────────────────────────────────────────────────┤');
      console.log(`│  📁 Directory: ${targetDir.slice(-30).padEnd(30)}│`);
      console.log(`│  🔗 Project: ${projectId.slice(0, 32).padEnd(32)}│`);
      console.log('├────────────────────────────────────────────────┤');
      console.log('│  Available commands:                           │');
      console.log('│  • recoder web sync    - Sync files            │');
      console.log('│  • recoder web push    - Upload local changes  │');
      console.log('│  • recoder web info    - Show project info     │');
      console.log('│  • recoder web unlink  - Remove link           │');
      console.log('└────────────────────────────────────────────────┘');

      console.log('\n🌐 Web IDE:', metadata.webUrl);
      console.log('🔗 Preview:', metadata.previewUrl);

    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  },
};
