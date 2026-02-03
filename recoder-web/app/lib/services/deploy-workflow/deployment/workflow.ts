/**
 * Deployment workflow orchestrator
 * Manages the execution of deployment steps in sequence
 */

import {
  type DeploymentParams,
  type DeploymentResult,
  type DeploymentContext,
  type DeploymentEnvironment,
  type Logger,
  DeploymentStatus
} from '../types';
import { DeploymentStateManager } from './state';
import { createLogger } from '../utils/logger';
import { DeploymentError, ErrorCodes } from '../utils/errors';
import {
  validateAndPrepare,
  createSandbox,
  syncFiles,
  buildProject,
  deployToCloudflare,
  updateDatabaseAndCleanup,
  cleanupOnFailure,
  terminateSandbox
} from './steps';

/**
 * Deployment step definition
 */
interface DeploymentStep {
  name: string;
  description: string;
  progressPercentage: number;
  status: DeploymentStatus;
  execute: (context: DeploymentContext) => Promise<any>;
}

/**
 * Queue-based deployment workflow
 * Orchestrates the execution of deployment steps
 */
export class DeploymentWorkflow {
  private env: DeploymentEnvironment;
  private stateManager: DeploymentStateManager;
  private logger: Logger;
  private stepResults: Record<string, any> = {};

  /**
   * Deployment steps in execution order
   */
  private readonly steps: DeploymentStep[] = [
    {
      name: 'validation',
      description: 'Validating project and preparing deployment',
      progressPercentage: 10,
      status: DeploymentStatus.VALIDATING,
      execute: validateAndPrepare
    },
    {
      name: 'sandbox',
      description: 'Creating deployment sandbox',
      progressPercentage: 25,
      status: DeploymentStatus.CREATING_SANDBOX,
      execute: createSandbox
    },
    {
      name: 'sync',
      description: 'Syncing files to sandbox',
      progressPercentage: 45,
      status: DeploymentStatus.SYNCING_FILES,
      execute: syncFiles
    },
    {
      name: 'build',
      description: 'Building project',
      progressPercentage: 70,
      status: DeploymentStatus.BUILDING,
      execute: buildProject
    },
    {
      name: 'deploy',
      description: 'Deploying to Cloudflare Workers',
      progressPercentage: 90,
      status: DeploymentStatus.DEPLOYING,
      execute: deployToCloudflare
    },
    {
      name: 'cleanup',
      description: 'Updating database and cleaning up',
      progressPercentage: 100,
      status: DeploymentStatus.UPDATING_DATABASE,
      execute: updateDatabaseAndCleanup
    }
  ];

  constructor(
    env: DeploymentEnvironment,
    stateManager: DeploymentStateManager,
    logger: Logger
  ) {
    this.env = env;
    this.stateManager = stateManager;
    this.logger = logger;
  }

  /**
   * Execute the complete deployment workflow
   */
  async execute(deploymentId: string, params: DeploymentParams): Promise<DeploymentResult> {
    const startTime = Date.now();

    this.logger.info('Starting deployment workflow', {
      deploymentId,
      projectId: params.projectId,
      userId: params.userId,
      organizationId: params.orgId
    });

    // Initialize deployment state
    await this.stateManager.initializeDeployment(deploymentId, params);

    // Get initial state
    const currentState = await this.stateManager.getDeploymentState(deploymentId);
    if (!currentState) {
      throw new Error(`Deployment state not found: ${deploymentId}`);
    }

    // Create deployment context
    const context: DeploymentContext = {
      deploymentId,
      env: this.env,
      params,
      state: currentState,
      logger: this.logger
    };

    try {
      // Execute each step in sequence
      for (const step of this.steps) {
        await this.executeStep(step, context);
      }

      // Get final state
      const finalState = await this.stateManager.getDeploymentState(deploymentId);
      const duration = Date.now() - startTime;

      // Mark deployment as completed
      await this.stateManager.markDeploymentCompleted(
        deploymentId,
        finalState?.stepResults.deploy?.data?.workerUrl
      );

      this.logger.info('Deployment workflow completed successfully', {
        deploymentId,
        duration,
        workerUrl: finalState?.stepResults.deploy?.data?.workerUrl
      });

      return {
        success: true,
        deploymentId,
        workerUrl: finalState?.stepResults.deploy?.data?.workerUrl,
        message: 'Project deployed successfully',
        duration,
        state: finalState!
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Deployment workflow failed', {
        deploymentId,
        error: errorMessage,
        duration
      });

      // Attempt to cleanup sandbox if it was created
      await this.handleFailure(context);

      // Mark deployment as failed
      await this.stateManager.markDeploymentFailed(deploymentId, errorMessage);

      const finalState = await this.stateManager.getDeploymentState(deploymentId);

      return {
        success: false,
        deploymentId,
        error: errorMessage,
        message: 'Deployment failed',
        duration,
        state: finalState!
      };
    }
  }

  /**
   * Execute a single deployment step
   */
  private async executeStep(step: DeploymentStep, context: DeploymentContext): Promise<void> {
    const stepStartTime = Date.now();

    this.logger.info(`Starting step: ${step.name}`, {
      deploymentId: context.deploymentId,
      step: step.name,
      description: step.description
    });

    // Update deployment status
    await this.stateManager.updateDeploymentStatus(
      context.deploymentId,
      step.status,
      step.progressPercentage,
      step.description
    );

    try {
      // Refresh state before executing
      const currentState = await this.stateManager.getDeploymentState(context.deploymentId);
      if (currentState) {
        // Merge saved step results with local step results
        context.state = {
          ...currentState,
          stepResults: { ...currentState.stepResults, ...this.stepResults }
        };
      }

      // Execute the step
      const result = await step.execute(context);
      const stepDuration = Date.now() - stepStartTime;

      this.logger.info(`Step completed: ${step.name}`, {
        deploymentId: context.deploymentId,
        step: step.name,
        duration: stepDuration
      });

      // Save step result
      const stepData = result?.data ? result.data : result;
      const stepResult = {
        success: true,
        duration: stepDuration,
        data: stepData
      };

      // Save to local memory for immediate access by subsequent steps
      this.stepResults[step.name] = stepResult;

      // Also save to state manager for persistence
      await this.stateManager.saveStepResult(context.deploymentId, step.name, stepResult);

    } catch (error) {
      const stepDuration = Date.now() - stepStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Step failed: ${step.name}`, {
        deploymentId: context.deploymentId,
        step: step.name,
        error: errorMessage,
        duration: stepDuration
      });

      // Save step error to state
      await this.stateManager.saveStepResult(context.deploymentId, step.name, {
        success: false,
        duration: stepDuration,
        error: errorMessage
      });

      // Re-throw error to stop workflow
      throw new DeploymentError(
        500,
        ErrorCodes.DEPLOYMENT_STEP_FAILED,
        `${step.name} failed: ${errorMessage}`,
        { step: step.name, originalError: error }
      );
    }
  }

  /**
   * Handle failure cleanup
   */
  private async handleFailure(context: DeploymentContext): Promise<void> {
    try {
      // Refresh state to get latest step results
      const currentState = await this.stateManager.getDeploymentState(context.deploymentId);
      if (currentState) {
        context.state = currentState;
      }

      await cleanupOnFailure(context);
    } catch (error) {
      this.logger.error('Error during failure cleanup', {
        deploymentId: context.deploymentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Create deployment workflow instance
 */
export function createDeploymentWorkflow(
  env: DeploymentEnvironment,
  stateManager?: DeploymentStateManager
): DeploymentWorkflow {
  const logger = createLogger(env);
  const manager = stateManager || new DeploymentStateManager(env);
  return new DeploymentWorkflow(env, manager, logger);
}

/**
 * Execute deployment with automatic workflow creation
 */
export async function executeDeployment(
  deploymentId: string,
  params: DeploymentParams,
  env: DeploymentEnvironment
): Promise<DeploymentResult> {
  const workflow = createDeploymentWorkflow(env);
  return workflow.execute(deploymentId, params);
}
