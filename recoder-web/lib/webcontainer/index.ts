/**
 * 🚀 WebContainer Integration - Adapted from bolt.new
 *
 * In-browser Node.js runtime powered by @webcontainer/api
 * Enables real code execution without backend servers
 */

import { WebContainer } from '@webcontainer/api';

export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

/**
 * Boot WebContainer (singleton pattern)
 * Only runs in browser, returns null on server
 */
export async function getWebContainer(): Promise<WebContainer | null> {
  // Server-side: return null
  if (typeof window === 'undefined') {
    return null;
  }

  // Already booted
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  // Currently booting
  if (bootPromise) {
    return bootPromise;
  }

  // Start boot process
  console.log('🚀 Booting WebContainer...');

  bootPromise = WebContainer.boot({
    workdirName: WORK_DIR_NAME
  })
    .then((container) => {
      webcontainerInstance = container;
      console.log('✅ WebContainer booted successfully');
      return container;
    })
    .catch((error) => {
      console.error('❌ WebContainer boot failed:', error);
      bootPromise = null; // Allow retry
      throw error;
    });

  return bootPromise;
}

/**
 * Write files to WebContainer
 */
export async function writeFiles(
  files: Array<{ path: string; content: string }>
): Promise<void> {
  const container = await getWebContainer();
  if (!container) {
    console.warn('WebContainer not available (server-side)');
    return;
  }

  for (const file of files) {
    const fullPath = `${WORK_DIR}/${file.path}`;
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));

    // Create directory if needed
    if (dirPath !== WORK_DIR) {
      await container.fs.mkdir(dirPath, { recursive: true });
    }

    // Write file
    await container.fs.writeFile(fullPath, file.content);
    console.log(`✅ Wrote file: ${file.path}`);
  }
}

/**
 * Run shell command in WebContainer
 */
export async function runCommand(
  command: string,
  args: string[] = []
): Promise<{ exitCode: number; output: string }> {
  const container = await getWebContainer();
  if (!container) {
    throw new Error('WebContainer not available');
  }

  console.log(`🔧 Running: ${command} ${args.join(' ')}`);

  const process = await container.spawn(command, args);

  let output = '';

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        output += data;
      },
    })
  );

  const exitCode = await process.exit;

  console.log(`✅ Command finished with exit code: ${exitCode}`);

  return { exitCode, output };
}

/**
 * Install npm packages
 */
export async function installPackages(packages: string[]): Promise<void> {
  const container = await getWebContainer();
  if (!container) {
    throw new Error('WebContainer not available');
  }

  console.log(`📦 Installing packages: ${packages.join(', ')}`);

  const process = await container.spawn('npm', ['install', ...packages]);

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );

  const exitCode = await process.exit;

  if (exitCode !== 0) {
    throw new Error(`Package installation failed with exit code ${exitCode}`);
  }

  console.log('✅ Packages installed successfully');
}

/**
 * Start dev server and get preview URL
 */
export async function startDevServer(
  command: string = 'npm',
  args: string[] = ['run', 'dev']
): Promise<string> {
  const container = await getWebContainer();
  if (!container) {
    throw new Error('WebContainer not available');
  }

  console.log(`🚀 Starting dev server: ${command} ${args.join(' ')}`);

  const process = await container.spawn(command, args);

  // Stream output
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );

  // Wait for server to be ready
  await container.on('server-ready', (port, url) => {
    console.log(`✅ Dev server ready at ${url}`);
  });

  // Get the preview URL
  const url = await new Promise<string>((resolve) => {
    container.on('server-ready', (port, url) => {
      resolve(url);
    });
  });

  return url;
}

/**
 * Read file from WebContainer
 */
export async function readFile(path: string): Promise<string> {
  const container = await getWebContainer();
  if (!container) {
    throw new Error('WebContainer not available');
  }

  const fullPath = `${WORK_DIR}/${path}`;
  const content = await container.fs.readFile(fullPath, 'utf-8');

  return content;
}

/**
 * List files in directory
 */
export async function listFiles(path: string = ''): Promise<string[]> {
  const container = await getWebContainer();
  if (!container) {
    throw new Error('WebContainer not available');
  }

  const fullPath = path ? `${WORK_DIR}/${path}` : WORK_DIR;
  const entries = await container.fs.readdir(fullPath, { withFileTypes: true });

  return entries.map(entry => entry.name);
}

export default {
  getWebContainer,
  writeFiles,
  runCommand,
  installPackages,
  startDevServer,
  readFile,
  listFiles,
};
