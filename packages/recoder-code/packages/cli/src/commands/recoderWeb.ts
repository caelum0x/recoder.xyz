/**
 * Recoder.xyz Web Platform CLI Commands
 * Manage projects from web IDE
 */

import open from 'open';
import { RecoderWebService } from '../services/RecoderWebService.js';
import { RecoderAuthService } from '../services/RecoderAuthService.js';
import { platformSync } from '../services/PlatformSyncService.js';

export async function handleRecoderWebCommand(args: string[]): Promise<void> {
  const webService = new RecoderWebService();
  const authService = new RecoderAuthService();
  const command = args[0];

  // Sync command doesn't require auth (uses container context)
  if (command === 'sync') {
    await handleSync(args.slice(1));
    return;
  }

  if (command === 'status') {
    await handleStatus();
    return;
  }

  // Check authentication for all other commands
  const isAuth = await authService.isAuthenticated();
  if (!isAuth) {
    console.error('❌ Not authenticated');
    console.log('💡 Run: recoder auth login');
    process.exit(1);
  }

  switch (command) {
    case 'list':
      await handleList(webService, args.slice(1));
      break;

    case 'download':
      await handleDownload(webService, args.slice(1));
      break;

    case 'open':
      await handleOpen(webService, args.slice(1));
      break;

    case 'info':
      await handleInfo(webService, args.slice(1));
      break;

    case 'push':
      await handlePush(webService, args.slice(1));
      break;

    default:
      showHelp();
      break;
  }
}

async function handleList(webService: RecoderWebService, args: string[]): Promise<void> {
  try {
    // Parse limit flag
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 && args[limitIndex + 1]
      ? parseInt(args[limitIndex + 1])
      : 50;

    console.log('📋 Fetching your web projects...\n');

    const projects = await webService.listProjects(limit);

    if (projects.length === 0) {
      console.log('No projects found. Create one at: http://localhost:5173');
      return;
    }

    console.log(`Found ${projects.length} projects:\n`);

    // Print table header
    console.log('┌' + '─'.repeat(68) + '┐');
    console.log(
      '│ ' +
      'URL ID'.padEnd(16) + ' │ ' +
      'Description'.padEnd(30) + ' │ ' +
      'Files'.padEnd(5) + ' │ ' +
      'Messages'.padEnd(8) + ' │'
    );
    console.log('├' + '─'.repeat(68) + '┤');

    // Print projects
    for (const project of projects) {
      const urlId = project.urlId.substring(0, 14) + '...';
      const description = (project.description || 'Untitled')
        .substring(0, 28)
        .padEnd(30);
      const fileCount = (project.fileCount?.toString() || '?').padEnd(5);
      const msgCount = project.messageCount.toString().padEnd(8);

      console.log(
        '│ ' +
        urlId.padEnd(16) + ' │ ' +
        description + ' │ ' +
        fileCount + ' │ ' +
        msgCount + ' │'
      );
    }

    console.log('└' + '─'.repeat(68) + '┘');

    console.log('\n💡 Commands:');
    console.log('  recoder web download <urlId>  - Download project files');
    console.log('  recoder web open <urlId>      - Open in browser');
    console.log('  recoder web info <urlId>      - Show project details');
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

async function handleDownload(webService: RecoderWebService, args: string[]): Promise<void> {
  const urlId = args[0];
  const outputDir = args[1]; // Optional

  if (!urlId) {
    console.error('❌ Please provide a project URL ID');
    console.log('\nUsage:');
    console.log('  recoder web download <urlId> [output-directory]');
    console.log('\nExample:');
    console.log('  recoder web download 1762542265823');
    console.log('  recoder web download 1762542265823 ./my-project');
    process.exit(1);
  }

  try {
    const result = await webService.downloadProject(urlId, outputDir);

    console.log('\n✅ Download complete!');
    console.log(`📂 Location: ${result.directory}`);
    console.log(`📄 Files: ${result.fileCount}`);
    console.log(`\n💡 Next steps:`);
    console.log(`  cd ${result.directory}`);
    console.log(`  npm install && npm run dev`);
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

async function handleOpen(webService: RecoderWebService, args: string[]): Promise<void> {
  const urlId = args[0];

  if (!urlId) {
    console.error('❌ Please provide a project URL ID');
    console.log('\nUsage:');
    console.log('  recoder web open <urlId>');
    console.log('\nExample:');
    console.log('  recoder web open 1762542265823');
    process.exit(1);
  }

  try {
    // Verify project exists first
    console.log('🔍 Verifying project...');
    await webService.getProject(urlId);

    const url = webService.getProjectUrl(urlId);
    console.log(`🌐 Opening project in browser...`);
    console.log(`   ${url}`);

    await open(url);

    console.log('✅ Browser opened successfully');
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

async function handleInfo(webService: RecoderWebService, args: string[]): Promise<void> {
  const urlId = args[0];

  if (!urlId) {
    console.error('❌ Please provide a project URL ID');
    console.log('\nUsage:');
    console.log('  recoder web info <urlId>');
    console.log('\nExample:');
    console.log('  recoder web info 1762542265823');
    process.exit(1);
  }

  try {
    console.log('📋 Fetching project details...\n');

    const project = await webService.getProject(urlId);

    console.log('📦 Project Information');
    console.log('─'.repeat(60));
    console.log(`URL ID:       ${project.urlId}`);
    console.log(`Description:  ${project.description || 'Untitled Project'}`);
    console.log(`Messages:     ${project.messages.length}`);
    console.log(`Files:        ${Object.keys(project.fileSnapshot).length}`);
    console.log(`Web URL:      ${webService.getProjectUrl(project.urlId)}`);

    if (Object.keys(project.fileSnapshot).length > 0) {
      console.log('\n📁 Files:');
      for (const filePath of Object.keys(project.fileSnapshot)) {
        const content = project.fileSnapshot[filePath];
        const size = content.length;
        const sizeStr = size > 1024
          ? `${(size / 1024).toFixed(1)}KB`
          : `${size}B`;
        console.log(`  • ${filePath} (${sizeStr})`);
      }
    }

    console.log('\n💡 Commands:');
    console.log(`  recoder web download ${urlId}  - Download files`);
    console.log(`  recoder web open ${urlId}      - Open in browser`);
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

async function handleSync(args: string[]): Promise<void> {
  const subCommand = args[0];

  switch (subCommand) {
    case 'start':
      await startSync();
      break;
    case 'stop':
      stopSync();
      break;
    default:
      await showSyncStatus();
      break;
  }
}

async function startSync(): Promise<void> {
  console.log('🔄 Starting platform sync...\n');

  const platform = await platformSync.detectPlatform();

  if (!platform.isContainer) {
    console.log('📍 Not running in recoder.xyz container');
    console.log('');
    console.log('💡 Platform sync works when you run recoder-code inside:');
    console.log('   - recoder.xyz web terminal');
    console.log('   - recoder.xyz Docker container');
    console.log('');
    console.log('For local development, changes will sync to web when you');
    console.log('push with: recoder web push <urlId>');
    return;
  }

  console.log('🐳 Detected recoder.xyz container');
  console.log(`📁 Project ID: ${platform.projectId || 'Unknown'}`);

  const connected = await platformSync.connect();

  if (connected) {
    console.log('✅ Connected to platform sync');
    console.log('');
    console.log('📡 File changes will now sync bidirectionally:');
    console.log('   - CLI edits → Web editor');
    console.log('   - Web edits → CLI workspace');
    console.log('');

    if (platform.previewUrl) {
      console.log(`🌐 Live Preview: ${platform.previewUrl}`);
    }

    // Start file watcher
    platformSync.startFileWatcher();

    // Listen for remote changes
    platformSync.on('remoteChange', (changes) => {
      console.log(`\n📥 Remote changes: ${changes.length} files updated`);
      for (const change of changes) {
        console.log(`   ${change.type}: ${change.path}`);
      }
    });

    platformSync.on('localChange', (change) => {
      console.log(`📤 Synced: ${change.type} ${change.path}`);
    });

    console.log('');
    console.log('Press Ctrl+C to stop sync');

    // Keep process running
    await new Promise(() => {});
  } else {
    console.log('❌ Failed to connect to platform');
    console.log('💡 Make sure docker-backend is running');
  }
}

function stopSync(): void {
  platformSync.disconnect();
  console.log('✅ Platform sync stopped');
}

async function showSyncStatus(): Promise<void> {
  const platform = await platformSync.detectPlatform();
  platformSync.displayStatus();

  if (platform.isContainer) {
    console.log('');
    console.log('Commands:');
    console.log('  recoder web sync start  - Start bidirectional sync');
    console.log('  recoder web sync stop   - Stop sync');
  }
}

async function handleStatus(): Promise<void> {
  console.log('📊 Platform Status\n');

  const platform = await platformSync.detectPlatform();

  console.log(`Environment: ${platform.isContainer ? '🐳 Container' : '💻 Local'}`);

  if (platform.isContainer) {
    console.log(`Project ID:  ${platform.projectId || 'Not detected'}`);
    console.log(`Backend:     ${platform.backendUrl}`);
    console.log(`Web URL:     ${platform.webUrl}`);
    console.log(`Sync:        ${platformSync.isConnected() ? '✅ Connected' : '❌ Disconnected'}`);

    if (platform.previewUrl) {
      console.log(`Preview:     ${platform.previewUrl}`);
    }

    console.log('');
    console.log('💡 Start sync: recoder web sync start');
  } else {
    console.log('');
    console.log('💡 Run recoder-code in recoder.xyz terminal for live sync');
    console.log('   Or use "recoder web push <urlId>" to upload local files');
  }
}

async function handlePush(webService: RecoderWebService, args: string[]): Promise<void> {
  const urlId = args[0];
  const directory = args[1] || process.cwd();

  if (!urlId) {
    console.error('❌ Please provide a project URL ID');
    console.log('\nUsage:');
    console.log('  recoder web push <urlId> [directory]');
    console.log('\nExample:');
    console.log('  recoder web push 1762542265823');
    console.log('  recoder web push 1762542265823 ./my-project');
    process.exit(1);
  }

  try {
    console.log(`📤 Scanning files in: ${directory}\n`);

    const files = await webService.scanDirectory(directory);
    const fileCount = Object.keys(files).length;

    if (fileCount === 0) {
      console.log('❌ No files found to upload');
      return;
    }

    console.log(`Found ${fileCount} files to upload`);

    // Get remote files for comparison
    let changes = { added: [] as string[], modified: [] as string[], deleted: [] as string[], unchanged: [] as string[] };
    try {
      const project = await webService.getProject(urlId);
      changes = await webService.detectChanges(files, project.fileSnapshot);

      console.log('');
      if (changes.added.length) console.log(`  + ${changes.added.length} new files`);
      if (changes.modified.length) console.log(`  ~ ${changes.modified.length} modified`);
      if (changes.deleted.length) console.log(`  - ${changes.deleted.length} deleted`);
      if (changes.unchanged.length) console.log(`  = ${changes.unchanged.length} unchanged`);
    } catch {
      // Project doesn't exist yet
      console.log('  Creating new project...');
    }

    console.log('');
    const result = await webService.uploadProject(urlId, files);

    if (result.success) {
      console.log('✅ Upload complete!');
      console.log(`📁 ${result.fileCount} files synced`);
      console.log(`🌐 View at: ${webService.getProjectUrl(urlId)}`);
    } else {
      console.log('❌ Upload failed');
    }
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

function showHelp(): void {
  console.log('Recoder.xyz Web Platform');
  console.log('\nManage projects from your web IDE');
  console.log('\nUsage:');
  console.log('  recoder web <command> [options]');
  console.log('\nCommands:');
  console.log('  list                List all your web projects');
  console.log('    --limit <n>       Max number to show (default: 50)');
  console.log('');
  console.log('  download <urlId>    Download project files to local machine');
  console.log('    [directory]       Optional output directory');
  console.log('');
  console.log('  push <urlId>        Upload local files to web project');
  console.log('    [directory]       Optional source directory (default: cwd)');
  console.log('');
  console.log('  sync                Platform sync (when in container)');
  console.log('    start             Start bidirectional sync');
  console.log('    stop              Stop sync');
  console.log('');
  console.log('  status              Show platform connection status');
  console.log('  open <urlId>        Open project in web browser');
  console.log('  info <urlId>        Show detailed project information');
  console.log('\nExamples:');
  console.log('  recoder web list');
  console.log('  recoder web list --limit 10');
  console.log('  recoder web download 1762542265823');
  console.log('  recoder web push 1762542265823 ./my-project');
  console.log('  recoder web sync start');
  console.log('  recoder web status');
  console.log('\n💡 Workflow:');
  console.log('  1. Create project in web IDE (https://web.recoder.xyz)');
  console.log('  2. List projects: recoder web list');
  console.log('  3. Download locally: recoder web download <urlId>');
  console.log('  4. Edit with full file system access');
  console.log('  5. Push changes: recoder web push <urlId>');
  console.log('');
  console.log('💡 In recoder.xyz terminal:');
  console.log('  Run "recoder web sync start" for live bidirectional sync');
  console.log('\nFor more information, visit: https://recoder.xyz/docs');
}
