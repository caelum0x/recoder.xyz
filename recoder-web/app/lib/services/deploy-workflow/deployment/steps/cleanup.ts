/**
 * Cleanup step for deployment workflow
 * Updates database and cleans up resources after deployment
 */

import type { DeploymentContext, CleanupResult } from '../../types';
import { CommonErrors } from '../../utils/errors';
import { terminateSandbox } from './sandbox';

/**
 * Cleanup-specific timeout configuration
 */
const CLEANUP_TIMEOUTS = {
  DATABASE: 30000, // 30 seconds
  SANDBOX: 30000, // 30 seconds
  ARTIFACTS: 60000 // 1 minute
};

/**
 * Database update interface for deployment records
 */
export interface DeploymentDatabaseRecord {
  projectId: string;
  deploymentId: string;
  workerUrl: string;
  status: 'deployed' | 'failed';
  completedAt: string;
  duration?: number;
}

/**
 * Update database with deployment result (mock implementation)
 * In production, this would update the actual database
 */
async function updateDatabase(
  record: DeploymentDatabaseRecord,
  logger: DeploymentContext['logger']
): Promise<boolean> {
  logger.info('Updating database with deployment result', {
    projectId: record.projectId,
    deploymentId: record.deploymentId,
    workerUrl: record.workerUrl,
    status: record.status
  });

  try {
    // Mock database update - in production, this would be an actual DB call
    // Example: await db.update(project).set({ productionDeployUrl: record.workerUrl }).where(eq(project.id, record.projectId))

    logger.info('Database updated successfully', {
      projectId: record.projectId,
      workerUrl: record.workerUrl
    });

    return true;
  } catch (error) {
    logger.error('Failed to update database', {
      projectId: record.projectId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Store deployment artifacts (mock implementation)
 * In production, this would store to R2 or similar storage
 */
async function storeArtifacts(
  deploymentId: string,
  projectId: string,
  workerUrl: string,
  metadata: Record<string, any>,
  logger: DeploymentContext['logger']
): Promise<boolean> {
  logger.info('Storing deployment artifacts', {
    deploymentId,
    projectId,
    workerUrl
  });

  try {
    // Mock artifact storage - in production, this would store to R2/S3
    const artifact = {
      deploymentId,
      projectId,
      workerUrl,
      completedAt: new Date().toISOString(),
      metadata
    };

    // Simulate storage
    logger.debug('Artifact data', { artifact });

    logger.info('Deployment artifacts stored successfully', {
      deploymentId
    });

    return true;
  } catch (error) {
    logger.error('Failed to store deployment artifacts', {
      deploymentId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Update database and cleanup resources step
 */
export async function updateDatabaseAndCleanup(
  context: DeploymentContext
): Promise<CleanupResult> {
  const { params, logger, state, deploymentId } = context;
  const { projectId } = params;

  // Get deployment results from previous steps
  const sandboxResult = state.stepResults.sandbox;
  const deployResult = state.stepResults.deploy;

  if (!sandboxResult?.data?.sandboxId) {
    throw CommonErrors.invalidRequest('Sandbox ID not found from sandbox creation step');
  }

  if (!deployResult?.data?.workerUrl) {
    throw CommonErrors.invalidRequest('Worker URL not found from deploy step');
  }

  const sandboxId = sandboxResult.data.sandboxId;
  const workerUrl = deployResult.data.workerUrl;

  logger.info('Starting database update and cleanup', {
    projectId,
    sandboxId,
    workerUrl
  });

  let databaseUpdated = false;
  let sandboxCleaned = false;
  let artifactsStored = false;

  // Step 1: Update database with deployment URL
  try {
    logger.info('Updating project database record');

    databaseUpdated = await updateDatabase({
      projectId,
      deploymentId,
      workerUrl,
      status: 'deployed',
      completedAt: new Date().toISOString()
    }, logger);

  } catch (error) {
    logger.error('Failed to update database', {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't fail the entire cleanup if database update fails
  }

  // Step 2: Store deployment artifacts and logs
  try {
    logger.info('Storing deployment artifacts');

    const deploymentMetadata = {
      deploymentId,
      projectId,
      workerUrl,
      sandboxId,
      completedAt: new Date().toISOString(),
      steps: Object.keys(state.stepResults),
      success: true
    };

    artifactsStored = await storeArtifacts(
      deploymentId,
      projectId,
      workerUrl,
      deploymentMetadata,
      logger
    );

  } catch (error) {
    logger.error('Failed to store deployment artifacts', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't fail the entire cleanup if artifact storage fails
  }

  // Step 3: Cleanup sandbox
  try {
    logger.info('Cleaning up sandbox', { sandboxId });

    sandboxCleaned = await terminateSandbox(sandboxId, logger);

    if (sandboxCleaned) {
      logger.info('Sandbox cleaned up successfully', { sandboxId });
    } else {
      logger.warn('Sandbox cleanup failed', { sandboxId });
    }

  } catch (error) {
    logger.error('Failed to cleanup sandbox', {
      sandboxId,
      error: error instanceof Error ? error.message : String(error)
    });
    sandboxCleaned = false;
    // Don't fail the entire cleanup if sandbox cleanup fails
    // Sandbox will be cleaned up by timeout anyway
  }

  // Determine overall success (database update is the most critical)
  const overallSuccess = databaseUpdated;

  logger.info('Cleanup completed', {
    databaseUpdated,
    sandboxCleaned,
    artifactsStored,
    overallSuccess
  });

  if (!overallSuccess) {
    throw new Error('Critical cleanup operations failed - database update unsuccessful');
  }

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      databaseUpdated,
      sandboxCleaned,
      artifactsStored
    }
  };
}

/**
 * Cleanup on failure - called when deployment fails at any step
 */
export async function cleanupOnFailure(
  context: DeploymentContext
): Promise<void> {
  const { logger, state } = context;

  // Check if sandbox was created
  const sandboxResult = state.stepResults.sandbox;
  if (sandboxResult?.data?.sandboxId) {
    const sandboxId = sandboxResult.data.sandboxId;

    logger.info('Attempting to cleanup sandbox after deployment failure', {
      deploymentId: context.deploymentId,
      sandboxId
    });

    try {
      const cleanupSuccess = await terminateSandbox(sandboxId, logger);

      if (cleanupSuccess) {
        logger.info('Sandbox cleaned up successfully after failure', {
          deploymentId: context.deploymentId,
          sandboxId
        });
      } else {
        logger.warn('Failed to cleanup sandbox after failure', {
          deploymentId: context.deploymentId,
          sandboxId
        });
      }
    } catch (error) {
      logger.error('Error during failure cleanup', {
        deploymentId: context.deploymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw error for cleanup operations
    }
  }
}
