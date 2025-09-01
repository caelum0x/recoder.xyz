import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '@/lib/logger';

interface DeploymentPlatform {
  id: string;
  name: string;
  url?: string;
  status: 'pending' | 'building' | 'deployed' | 'failed';
  buildTime?: number;
  logs?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { platforms = ['vercel'], buildCommand, outputDir } = await request.json();

    const projectPath = path.join(process.cwd(), 'projects', projectId);

    // Check if project exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    // Read project metadata
    const metadataPath = path.join(projectPath, '.recoder', 'metadata.json');
    let projectMetadata = {};
    if (fs.existsSync(metadataPath)) {
      projectMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    // Initialize deployment status
    const deployments: DeploymentPlatform[] = platforms.map((platform: string) => ({
      id: platform,
      name: platform.charAt(0).toUpperCase() + platform.slice(1),
      status: 'pending' as const,
      logs: []
    }));

    // Start deployment process for each platform
    const deploymentPromises = platforms.map(async (platform: string) => {
      const deployment = deployments.find(d => d.id === platform)!;
      const startTime = Date.now();

      try {
        deployment.status = 'building';
        
        // Build the project first
        const buildCmd = buildCommand || 'npm run build';
        const buildProcess = spawn(buildCmd, {
          cwd: projectPath,
          stdio: 'pipe',
          shell: true
        });

        let buildOutput = '';
        buildProcess.stdout?.on('data', (data) => {
          buildOutput += data.toString();
          deployment.logs?.push(data.toString());
        });

        buildProcess.stderr?.on('data', (data) => {
          buildOutput += data.toString();
          deployment.logs?.push(`ERROR: ${data.toString()}`);
        });

        // Wait for build to complete
        const buildExitCode = await new Promise((resolve) => {
          buildProcess.on('close', resolve);
        });

        if (buildExitCode !== 0) {
          deployment.status = 'failed';
          deployment.logs?.push(`Build failed with exit code ${buildExitCode}`);
          return deployment;
        }

        // Deploy based on platform
        let deploymentResult;
        switch (platform) {
          case 'vercel':
            deploymentResult = await deployToVercel(projectPath, deployment);
            break;
          case 'netlify':
            deploymentResult = await deployToNetlify(projectPath, deployment);
            break;
          case 'railway':
            deploymentResult = await deployToRailway(projectPath, deployment);
            break;
          default:
            throw new Error(`Unsupported platform: ${platform}`);
        }

        deployment.status = 'deployed';
        deployment.url = deploymentResult.url;
        deployment.buildTime = Date.now() - startTime;
        deployment.logs?.push(`Successfully deployed to ${deploymentResult.url}`);

      } catch (error) {
        deployment.status = 'failed';
        deployment.buildTime = Date.now() - startTime;
        deployment.logs?.push(`Deployment failed: ${error}`);
      }

      return deployment;
    });

    // Wait for all deployments to complete
    const completedDeployments = await Promise.all(deploymentPromises);

    // Update project metadata with deployment info
    const updatedMetadata = {
      ...projectMetadata,
      deployments: completedDeployments,
      lastDeployment: new Date().toISOString()
    };

    fs.writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));

    logger.info(`Deployment completed for project ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        deployments: completedDeployments,
        totalBuildTime: completedDeployments.reduce((sum, d) => sum + (d.buildTime || 0), 0),
        successfulDeployments: completedDeployments.filter(d => d.status === 'deployed').length,
        failedDeployments: completedDeployments.filter(d => d.status === 'failed').length
      }
    });

  } catch (error) {
    logger.error('Error in deployment:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to deploy project'
    }, { status: 500 });
  }
}

async function deployToVercel(projectPath: string, deployment: DeploymentPlatform) {
  return new Promise((resolve, reject) => {
    const deployProcess = spawn('vercel', ['--prod', '--yes'], {
      cwd: projectPath,
      stdio: 'pipe'
    });

    let output = '';
    deployProcess.stdout?.on('data', (data) => {
      output += data.toString();
      deployment.logs?.push(data.toString());
    });

    deployProcess.on('close', (code) => {
      if (code === 0) {
        // Extract URL from vercel output
        const urlMatch = output.match(/https:\/\/[^\s]+/);
        const url = urlMatch ? urlMatch[0] : 'https://deployment-url-not-found.vercel.app';
        resolve({ url });
      } else {
        reject(new Error(`Vercel deployment failed with code ${code}`));
      }
    });
  });
}

async function deployToNetlify(projectPath: string, deployment: DeploymentPlatform) {
  return new Promise((resolve, reject) => {
    const deployProcess = spawn('netlify', ['deploy', '--prod', '--dir', 'dist'], {
      cwd: projectPath,
      stdio: 'pipe'
    });

    let output = '';
    deployProcess.stdout?.on('data', (data) => {
      output += data.toString();
      deployment.logs?.push(data.toString());
    });

    deployProcess.on('close', (code) => {
      if (code === 0) {
        // Extract URL from netlify output
        const urlMatch = output.match(/https:\/\/[^\s]+\.netlify\.app/);
        const url = urlMatch ? urlMatch[0] : 'https://deployment-url-not-found.netlify.app';
        resolve({ url });
      } else {
        reject(new Error(`Netlify deployment failed with code ${code}`));
      }
    });
  });
}

async function deployToRailway(projectPath: string, deployment: DeploymentPlatform) {
  return new Promise((resolve, reject) => {
    const deployProcess = spawn('railway', ['up'], {
      cwd: projectPath,
      stdio: 'pipe'
    });

    let output = '';
    deployProcess.stdout?.on('data', (data) => {
      output += data.toString();
      deployment.logs?.push(data.toString());
    });

    deployProcess.on('close', (code) => {
      if (code === 0) {
        // Extract URL from railway output
        const urlMatch = output.match(/https:\/\/[^\s]+\.railway\.app/);
        const url = urlMatch ? urlMatch[0] : 'https://deployment-url-not-found.railway.app';
        resolve({ url });
      } else {
        reject(new Error(`Railway deployment failed with code ${code}`));
      }
    });
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const metadataPath = path.join(process.cwd(), 'projects', projectId, '.recoder', 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json({
        success: true,
        data: { deployments: [] }
      });
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    
    return NextResponse.json({
      success: true,
      data: {
        deployments: metadata.deployments || [],
        lastDeployment: metadata.lastDeployment
      }
    });

  } catch (error) {
    logger.error('Error fetching deployments:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch deployments'
    }, { status: 500 });
  }
}
