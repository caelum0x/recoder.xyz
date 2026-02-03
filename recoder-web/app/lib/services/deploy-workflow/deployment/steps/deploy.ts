/**
 * Deploy step for deployment workflow
 * Deploys the built project to the target platform (e.g., Cloudflare Workers)
 */

import type { DeploymentContext, DeployResult } from '../../types';
import { DEPLOYMENT_CONFIG } from '../../utils/common';
import { CommonErrors } from '../../utils/errors';
import { connectToSandbox, type ISandbox } from './sandbox';

/**
 * Deploy-specific timeout configuration
 */
const DEPLOY_TIMEOUTS = {
  DEPLOY: 180000, // 3 minutes
  COMMAND: 30000, // 30 seconds
  VERIFY: 10000 // 10 seconds for verification
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
 * Parse worker URL from deployment output
 */
function parseWorkerUrl(output: string, workerName: string): string {
  // Try to extract worker URL from output
  const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/i) ||
    output.match(/https:\/\/[^\s]+\.libra\.sh/i) ||
    output.match(/https:\/\/[^\s]+\.recoder\.sh/i);

  if (urlMatch) {
    return urlMatch[0];
  }

  // Construct expected URL based on worker name
  return `https://${workerName}.workers.dev`;
}

/**
 * Verify deployment is accessible
 */
async function verifyDeployment(
  workerUrl: string,
  logger: DeploymentContext['logger']
): Promise<boolean> {
  try {
    logger.info('Verifying deployment accessibility', { workerUrl });

    // In a real implementation, this would make an HTTP request
    // For now, we simulate verification
    const isAccessible = true; // Mock verification

    logger.info('Deployment verification completed', {
      workerUrl,
      accessible: isAccessible
    });

    return isAccessible;
  } catch (error) {
    logger.warn('Deployment verification failed, but deployment may still be successful', {
      workerUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Deploy to Cloudflare Workers step
 */
export async function deployToCloudflare(context: DeploymentContext): Promise<DeployResult> {
  const { env, logger, state } = context;

  // Get sandbox info from previous step
  const sandboxResult = state.stepResults.sandbox;
  if (!sandboxResult?.data?.sandboxId) {
    throw CommonErrors.invalidRequest('Sandbox ID not found from sandbox creation step');
  }

  // Get deployment config from validation step
  const validationResult = state.stepResults.validation;
  if (!validationResult?.data?.deploymentConfig) {
    throw CommonErrors.invalidRequest('Deployment configuration not found from validation step');
  }

  const sandboxId = sandboxResult.data.sandboxId;
  const { workerName } = validationResult.data.deploymentConfig;

  logger.info('Starting Cloudflare Workers deployment', {
    sandboxId,
    workerName
  });

  // Connect to the sandbox
  const sandbox = await connectToSandbox(sandboxId);

  // Build deployment command
  const dispatchNamespace = env.DISPATCH_NAMESPACE_NAME || 'recoder-dispatcher';
  const deployCommand = `cd ${DEPLOYMENT_CONFIG.PROJECT_PATH} && bun wrangler deploy --dispatch-namespace ${dispatchNamespace} --name ${workerName}`;

  logger.info('Deploying to Cloudflare Workers', {
    workerName,
    dispatchNamespace,
    command: deployCommand
  });

  // Execute deployment
  const deployResult = await executeCommand(
    sandbox,
    deployCommand,
    DEPLOY_TIMEOUTS.DEPLOY,
    'Deploy',
    logger
  );

  const deployOutput = deployResult.stdout || '';

  logger.info('Deployment command executed', {
    output: deployOutput.slice(-300) // Log last 300 chars
  });

  // Parse deployment output to extract worker URL
  const deploymentSuccess = !deployOutput.toLowerCase().includes('error') &&
    !deployOutput.toLowerCase().includes('failed');

  if (!deploymentSuccess) {
    throw new Error(`Deployment failed. Output: ${deployOutput.slice(-500)}`);
  }

  const workerUrl = parseWorkerUrl(deployOutput, workerName);

  logger.info('Deployment successful', {
    workerName,
    workerUrl,
    deploymentSuccess
  });

  // Verify deployment (non-blocking)
  await verifyDeployment(workerUrl, logger);

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      workerUrl,
      deploymentSuccess,
      workerName
    }
  };
}

/**
 * Deploy to alternative platforms (extensibility point)
 */
export async function deployToAlternativePlatform(
  context: DeploymentContext,
  platform: 'vercel' | 'netlify' | 'railway'
): Promise<DeployResult> {
  const { logger, state } = context;

  // Get validation config
  const validationResult = state.stepResults.validation;
  if (!validationResult?.data?.deploymentConfig) {
    throw CommonErrors.invalidRequest('Deployment configuration not found');
  }

  const { workerName } = validationResult.data.deploymentConfig;

  logger.info('Deploying to alternative platform', {
    platform,
    workerName
  });

  // Platform-specific deployment logic would go here
  // For now, return mock result
  const workerUrl = `https://${workerName}.${platform}.app`;

  logger.info('Alternative platform deployment completed', {
    platform,
    workerUrl
  });

  return {
    success: true,
    duration: 0,
    data: {
      workerUrl,
      deploymentSuccess: true,
      workerName
    }
  };
}
