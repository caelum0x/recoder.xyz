import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '@/lib/logger';
import net from 'net';

// Helper function to find available port
async function findAvailablePort(startPort: number, endPort: number): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${startPort}-${endPort}`);
}

// Check if port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projectPath = path.join(process.cwd(), 'projects', projectId);

    // Check if project exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    // Check if package.json exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return NextResponse.json({
        success: false,
        error: 'No package.json found. Cannot start preview.'
      }, { status: 400 });
    }

    // Read package.json to determine start script
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const startScript = packageJson.scripts?.dev || packageJson.scripts?.start;

    if (!startScript) {
      return NextResponse.json({
        success: false,
        error: 'No dev or start script found in package.json'
      }, { status: 400 });
    }

    // Check if node_modules exists, if not install dependencies
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      logger.info(`Installing dependencies for project ${projectId}...`);
      
      try {
        // Install dependencies first
        const installProcess = spawn('npm', ['install'], {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });

        let installOutput = '';
        installProcess.stdout?.on('data', (data) => {
          installOutput += data.toString();
        });

        installProcess.stderr?.on('data', (data) => {
          installOutput += data.toString();
        });

        // Wait for installation to complete
        await new Promise<void>((resolve, reject) => {
          installProcess.on('close', (code) => {
            if (code === 0) {
              logger.info(`Dependencies installed successfully for project ${projectId}`);
              resolve();
            } else {
              logger.error(`Dependency installation failed with code ${code}`, { output: installOutput });
              reject(new Error(`Dependency installation failed: ${installOutput.slice(-500)}`));
            }
          });
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: `Failed to install dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, { status: 500 });
      }
    }

    // Find available port
    const availablePort = await findAvailablePort(3010, 3100);
    
    // Start the preview server
    const child = spawn('npm', ['run', 'dev'], {
      cwd: projectPath,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: availablePort.toString() }
    });

    let output = '';
    let serverStarted = false;

    // Capture output
    child.stdout?.on('data', (data) => {
      output += data.toString();
      if (data.toString().includes(`localhost:${availablePort}`) || 
          data.toString().includes('Local:') || 
          data.toString().includes('webpack compiled')) {
        serverStarted = true;
      }
    });

    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    // Wait for server to start or timeout
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (!serverStarted && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (serverStarted) {
      logger.info(`Preview server started for project ${projectId}`);
      return NextResponse.json({
        success: true,
        data: {
          previewUrl: `http://localhost:${availablePort}`,
          pid: child.pid,
          output: output.slice(-1000) // Last 1000 characters
        }
      });
    } else {
      child.kill();
      return NextResponse.json({
        success: false,
        error: 'Failed to start preview server',
        output: output.slice(-1000)
      }, { status: 500 });
    }

  } catch (error) {
    logger.error('Error starting preview:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to start preview'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { pid } = await request.json();

    if (pid) {
      process.kill(pid, 'SIGTERM');
      logger.info(`Stopped preview server (PID: ${pid}) for project ${projectId}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Preview server stopped'
    });

  } catch (error) {
    logger.error('Error stopping preview:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to stop preview'
    }, { status: 500 });
  }
}
