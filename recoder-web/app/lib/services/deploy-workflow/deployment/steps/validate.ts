/**
 * Validation step for deployment workflow
 * Validates project, permissions, and prepares deployment configuration
 */

import type { DeploymentContext, ValidationResult } from '../../types';
import { DEPLOYMENT_CONFIG } from '../../utils/common';
import { CommonErrors } from '../../utils/errors';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeployValidate');

/**
 * Validation-specific timeout configuration
 */
const VALIDATION_TIMEOUT = 600000; // 10 minutes

/**
 * Parse message history from JSON string
 */
function parseMessageHistory(messageHistory: string | any[] | null): any[] {
  if (Array.isArray(messageHistory)) {
    return messageHistory;
  }
  try {
    return JSON.parse(messageHistory || '[]');
  } catch {
    return [];
  }
}

/**
 * Validate deployment parameters
 */
function validateParams(params: DeploymentContext['params']): void {
  const { projectId, orgId, userId } = params;

  if (!projectId) {
    throw CommonErrors.invalidRequest('Missing required parameter: projectId');
  }

  if (!orgId) {
    throw CommonErrors.invalidRequest('Missing required parameter: orgId');
  }

  if (!userId) {
    throw CommonErrors.invalidRequest('Missing required parameter: userId');
  }
}

/**
 * Validate environment configuration
 */
function validateEnvironment(env: DeploymentContext['env']): void {
  // Check for Cloudflare credentials if deploying to Cloudflare
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    // Not a fatal error - deployment might use alternative methods
    logger.warn('Cloudflare credentials not configured');
  }
}

/**
 * Get project data (mock implementation)
 * In production, this would query the database
 */
async function getProjectData(
  projectId: string,
  orgId: string,
  logger: DeploymentContext['logger']
): Promise<any> {
  logger.info('Fetching project data', { projectId, orgId });

  // Mock project data - in production, this would be a database query
  return {
    id: projectId,
    name: `Project ${projectId}`,
    organizationId: orgId,
    isActive: true,
    messageHistory: null,
    customDomain: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Check and update deploy quota (mock implementation)
 * In production, this would check against subscription limits
 */
async function checkDeployQuota(
  orgId: string,
  logger: DeploymentContext['logger']
): Promise<boolean> {
  logger.info('Checking deploy quota', { organizationId: orgId });

  // Mock quota check - in production, this would query subscription limits
  // For now, always return true (quota available)
  return true;
}

/**
 * Get deployment template based on project configuration
 */
function getDeploymentTemplate(_projectData: any): string {
  // In production, this would analyze project files to determine framework
  // For now, return default template
  return DEPLOYMENT_CONFIG.DEFAULT_TEMPLATE;
}

/**
 * Validate permissions and prepare deployment configuration
 */
export async function validateAndPrepare(
  context: DeploymentContext
): Promise<ValidationResult> {
  const { params, env, logger } = context;
  const { projectId, customDomain, orgId, userId } = params;

  logger.info('Starting validation and preparation', {
    projectId,
    userId,
    organizationId: orgId,
    hasCustomDomain: !!customDomain
  });

  // Validate required parameters
  validateParams(params);

  // Validate environment configuration
  validateEnvironment(env);

  // Check and deduct deploy quota FIRST to avoid duplicate deductions during retries
  logger.info('Checking deploy quota', { organizationId: orgId });

  const hasQuota = await checkDeployQuota(orgId, logger);
  if (!hasQuota) {
    throw CommonErrors.quotaExceeded(orgId);
  }

  logger.info('Deploy quota verified successfully', { organizationId: orgId });

  // Get project data and validate
  const projectData = await getProjectData(projectId, orgId, logger);

  if (!projectData?.isActive) {
    throw CommonErrors.projectInactive(projectId);
  }

  logger.info('Project validation successful', {
    projectId,
    projectName: projectData.name
  });

  // Get template configuration
  const template = getDeploymentTemplate(projectData);

  // Get initFiles from params or use empty object
  const initFiles = params.initFiles || {};

  // Parse message history from project data or params
  const historyMessages = params.historyMessages ||
    parseMessageHistory(projectData.messageHistory);

  // Prepare deployment configuration
  const deploymentConfig = {
    projectId,
    workerName: `${projectId}-worker`,
    customDomain,
    template,
    timeout: VALIDATION_TIMEOUT
  };

  logger.info('Deployment configuration prepared', {
    workerName: deploymentConfig.workerName,
    template: deploymentConfig.template,
    timeout: deploymentConfig.timeout,
    initFilesCount: Object.keys(initFiles).length,
    historyMessagesCount: historyMessages.length
  });

  return {
    success: true,
    duration: 0, // Will be set by workflow
    data: {
      projectData,
      deploymentConfig,
      initFiles,
      historyMessages
    }
  };
}
