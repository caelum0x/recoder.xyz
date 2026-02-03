/**
 * Build step for deployment workflow
 * Builds the project in the sandbox environment
 */

import type { DeploymentContext, BuildResult } from '../../types';
import { DEPLOYMENT_CONFIG } from '../../utils/common';
import { CommonErrors } from '../../utils/errors';
import { connectToSandbox, type ISandbox } from './sandbox';

/**
 * Build-specific timeout configuration
 */
const BUILD_TIMEOUTS = {
  BUILD: 300000, // 5 minutes
  COMMAND: 30000 // 30 seconds
};

/**
 * Execute command in sandbox with error handling
 */
async function executeCommand(
  sandbox: ISandbox,
  command: string,
  timeoutMs: number,
  stepName: string,
  logger: DeploymentContext['logger']
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  logger.info(`Executing command: ${command}`, { timeoutMs, stepName });

  const result = await sandbox.executeCommand(command, {
    timeoutMs,
    onStderr: (data: string) => {
      logger.warn(`[${stepName} Error] ${data}`, { stepName });
    }
  });

  // Check exit code
  if (result.exitCode !== 0) {
    const errorDetails: string[] = [];
    if (result.stdout) errorDetails.push(`STDOUT: ${result.stdout}`);
    if (result.stderr) errorDetails.push(`STDERR: ${result.stderr}`);

    const errorMessage = `${stepName} failed with exit code ${result.exitCode}${
      errorDetails.length > 0 ? `\n${errorDetails.join('\n')}` : ''
    }`;

    logger.error(errorMessage, { stepName, exitCode: result.exitCode });
    throw new Error(errorMessage);
  }

  logger.info('Command completed successfully', {
    stepName,
    exitCode: result.exitCode,
    hasStdout: !!result.stdout,
    hasStderr: !!result.stderr
  });

  return result;
}

/**
 * Check if build output indicates success
 */
function isBuildSuccessful(
  buildOutput: string,
  projectCheckOutput: string
): boolean {
  const hasError = buildOutput.toLowerCase().includes('error') &&
    !buildOutput.toLowerCase().includes('0 errors');
  const hasFailed = buildOutput.toLowerCase().includes('failed');
  const hasProjectFiles = projectCheckOutput.includes('package.json') ||
    projectCheckOutput.includes('wrangler.jsonc') ||
    projectCheckOutput.includes('wrangler.toml');

  return !hasError && !hasFailed && hasProjectFiles;
}

/**
 * Build project step
 */
export async function buildProject(context: DeploymentContext): Promise<BuildResult> {
  const { logger, state } = context;

  // Get sandbox info from previous step
  const sandboxResult = state.stepResults.sandbox;
  if (!sandboxResult?.data?.sandboxId) {
    throw CommonErrors.invalidRequest('Sandbox ID not found from sandbox creation step');
  }

  const sandboxId = sandboxResult.data.sandboxId;

  logger.info('Starting project build', {
    sandboxId,
    projectPath: DEPLOYMENT_CONFIG.PROJECT_PATH
  });

  // Connect to the sandbox
  const sandbox = await connectToSandbox(sandboxId);

  // Install dependencies
  logger.info('Installing dependencies');
  const installResult = await executeCommand(
    sandbox,
    `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && bun install`,
    BUILD_TIMEOUTS.BUILD,
    'Install',
    logger
  );

  logger.info('Dependencies installed successfully', {
    output: (installResult.stdout || '').slice(-200) // Log last 200 chars
  });

  // Build the project
  logger.info('Building project');
  const buildResult = await executeCommand(
    sandbox,
    `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && bun run build`,
    BUILD_TIMEOUTS.BUILD,
    'Build',
    logger
  );

  logger.info('Project built successfully', {
    output: (buildResult.stdout || '').slice(-200) // Log last 200 chars
  });

  // Verify build artifacts
  logger.info('Verifying build artifacts');
  let distCheckResult: { stdout: string; stderr: string; exitCode: number };
  try {
    distCheckResult = await executeCommand(
      sandbox,
      `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && ls -la dist/ || ls -la build/ || ls -la .next/ || echo "No standard build directory found"`,
      BUILD_TIMEOUTS.COMMAND,
      'DistCheck',
      logger
    );
  } catch {
    distCheckResult = { exitCode: 0, stdout: 'No standard build directory found', stderr: '' };
  }

  logger.info('Build artifacts verification', {
    distCheck: (distCheckResult.stdout || '').slice(-300)
  });

  // Check for wrangler.jsonc, wrangler.toml or package.json to ensure it's a valid project
  let projectCheckResult: { stdout: string; stderr: string; exitCode: number };
  try {
    projectCheckResult = await executeCommand(
      sandbox,
      `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && (ls wrangler.jsonc || ls wrangler.toml || ls package.json || echo "No project files found")`,
      BUILD_TIMEOUTS.COMMAND,
      'ProjectCheck',
      logger
    );
  } catch {
    projectCheckResult = { exitCode: 0, stdout: 'No project files found', stderr: '' };
  }

  const buildOutput = buildResult.stdout || '';
  const projectCheckOutput = projectCheckResult.stdout || '';

  const buildSuccess = isBuildSuccessful(buildOutput, projectCheckOutput);

  if (!buildSuccess) {
    throw new Error(`Build failed. Output: ${buildOutput.slice(-500)}`);
  }

  // Get list of build artifacts
  const artifacts: string[] = [];
  try {
    const artifactsResult = await sandbox.executeCommand(
      `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && find . -name "*.js" -o -name "*.ts" -o -name "*.json" | head -20`,
      { timeoutMs: BUILD_TIMEOUTS.COMMAND }
    );
    const artifactsList = artifactsResult.stdout || '';
    artifacts.push(...artifactsList.split('\n').filter((line: string) => line.trim()));
  } catch (error) {
    logger.warn('Could not list build artifacts', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  logger.info('Build completed successfully', {
    buildSuccess,
    artifactCount: artifacts.length,
    artifacts: artifacts.slice(0, 10) // Log first 10 artifacts
  });

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      buildSuccess,
      buildOutput,
      artifacts
    }
  };
}
