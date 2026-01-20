/**
 * Install recoder-code CLI in WebContainer
 */

import type { WebContainer } from '@webcontainer/api';

let isInstalled = false;
let isInstalling = false;

/**
 * Install recoder-code CLI locally in WebContainer (no root permissions needed)
 */
export async function installRecoderCLI(webcontainer: WebContainer): Promise<boolean> {
  if (isInstalled || isInstalling) {
    return isInstalled;
  }

  isInstalling = true;

  try {
    console.log('📦 Installing recoder-code CLI locally in WebContainer...');

    // Create a local directory for the CLI
    await webcontainer.fs.mkdir('cli-tools', { recursive: true });
    
    // Install recoder-code locally in cli-tools directory
    const installProcess = await webcontainer.spawn('npm', [
      'install', 
      'recoder-code',
      '--prefix',
      './cli-tools',
      '--no-save',
      '--no-audit',
      '--no-fund'
    ]);
    
    installProcess.output.pipeTo(new WritableStream({
      write(data) {
        // Filter out terminal escape codes and noise
        const cleanData = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
        if (cleanData && cleanData.length > 1 && !cleanData.match(/^\s*[-\\|/]\s*$/)) {
          console.log('📦', cleanData);
        }
      }
    }));

    const exitCode = await installProcess.exit;

    if (exitCode === 0) {
      // Create a symlink or alias in a directory that's in PATH
      try {
        // Create bin directory if it doesn't exist
        await webcontainer.fs.mkdir('bin', { recursive: true });
        
        // Create a simple shell script that calls the locally installed CLI
        const cliScript = `#!/bin/sh
node /home/project/cli-tools/node_modules/recoder-code/bin/recoder.js "$@"`;
        
        await webcontainer.fs.writeFile('bin/recoder', cliScript);
        
        // Make it executable
        await webcontainer.spawn('chmod', ['+x', 'bin/recoder']);
        
        // Add bin to PATH by updating shell profile
        const pathExport = 'export PATH="/home/project/bin:$PATH"';
        let bashrcContent = '';
        try {
          bashrcContent = await webcontainer.fs.readFile('.bashrc', 'utf-8');
        } catch {
          // .bashrc doesn't exist yet, that's fine
        }
        await webcontainer.fs.writeFile('.bashrc', bashrcContent + pathExport + '\n');
        
        console.log('✅ recoder-code CLI installed successfully');
        console.log('💡 CLI available as "recoder" command in terminal');
        isInstalled = true;
        return true;
      } catch (pathError) {
        console.warn('⚠️ CLI installed but PATH setup failed:', pathError);
        console.log('💡 You can run CLI with: node cli-tools/node_modules/recoder-code/bin/recoder.js');
        isInstalled = true;
        return true;
      }
    } else {
      console.log('📦 CLI install completed with non-zero exit code:', exitCode);
      console.log('💡 This is often normal for npm installs. Checking if CLI was installed...');
      
      // Even if npm install returned non-zero, check if CLI was actually installed
      try {
        const cliCheck = await webcontainer.fs.readFile('cli-tools/node_modules/recoder-code/package.json', 'utf-8');
        if (cliCheck) {
          console.log('✅ recoder-code CLI installed successfully (despite exit code)');
          console.log('💡 You can run CLI with: node cli-tools/node_modules/recoder-code/bin/recoder.js');
          isInstalled = true;
          return true;
        }
      } catch (checkError) {
        console.error('❌ Failed to install recoder-code CLI (exit code:', exitCode, ')');
        return false;
      }
      
      console.error('❌ Failed to install recoder-code CLI (exit code:', exitCode, ')');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to install recoder-code CLI:', error);
    return false;
  } finally {
    isInstalling = false;
  }
}

/**
 * Setup recoder-code CLI with authentication
 */
export async function setupRecoderCLI(webcontainer: WebContainer, userToken?: string): Promise<boolean> {
  // First install the CLI
  const installed = await installRecoderCLI(webcontainer);
  
  if (!installed) {
    return false;
  }

  // If user token provided, authenticate the CLI
  if (userToken) {
    try {
      console.log('🔐 Authenticating recoder CLI...');
      
      // Try to authenticate using the token
      const authProcess = await webcontainer.spawn('node', [
        'cli-tools/node_modules/recoder-code/bin/recoder.js',
        'auth',
        'token',
        userToken
      ]);
      
      const authExitCode = await authProcess.exit;
      
      if (authExitCode === 0) {
        console.log('✅ CLI authenticated successfully');
      } else {
        console.warn('⚠️ CLI authentication failed, but CLI is still usable');
      }
    } catch (authError) {
      console.warn('⚠️ CLI authentication failed:', authError);
    }
  }

  return true;
}

/**
 * Check if CLI is installed
 */
export function isCLIInstalled(): boolean {
  return isInstalled;
}

/**
 * Test if CLI is working by running a simple command
 */
export async function testCLI(webcontainer: WebContainer): Promise<boolean> {
  try {
    const testProcess = await webcontainer.spawn('recoder', ['--version']);
    const exitCode = await testProcess.exit;
    return exitCode === 0;
  } catch (error) {
    console.warn('CLI test failed:', error);
    return false;
  }
}

/**
 * Get CLI status and installation instructions
 */
export async function getCLIStatus(webcontainer: WebContainer): Promise<{
  installed: boolean;
  working: boolean;
  instructions?: string;
}> {
  const installed = isCLIInstalled();
  
  if (!installed) {
    return {
      installed: false,
      working: false,
      instructions: 'Click "Install CLI" to set up recoder-code CLI'
    };
  }

  const working = await testCLI(webcontainer);
  
  if (!working) {
    return {
      installed: true,
      working: false,
      instructions: 'CLI installed but not working. Try: node cli-tools/node_modules/recoder-code/bin/recoder.js --version'
    };
  }

  return {
    installed: true,
    working: true,
    instructions: 'CLI ready! Try: recoder --help'
  };
}
