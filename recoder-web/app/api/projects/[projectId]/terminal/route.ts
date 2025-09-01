import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { command } = await request.json();

    if (!command) {
      return NextResponse.json({
        success: false,
        error: 'Command is required'
      }, { status: 400 });
    }

    const projectPath = path.join(process.cwd(), 'projects', projectId);

    // Check if project exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    // Execute the command
    const child = spawn(command, {
      cwd: projectPath,
      stdio: 'pipe',
      shell: true,
      env: process.env
    });

    let output = '';
    let errorOutput = '';

    // Capture output
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Wait for command to complete
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    logger.info(`Command executed: ${command} (exit code: ${exitCode})`);

    return NextResponse.json({
      success: true,
      data: {
        command,
        output,
        errorOutput,
        exitCode,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error executing command:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to execute command'
    }, { status: 500 });
  }
}
