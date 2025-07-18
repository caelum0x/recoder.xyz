const { logger } = require('../utils/logger');
const { plannerService } = require('../services/plannerService');

const validatePlanningRequest = (req, res, next) => {
  try {
    const { requirements, constraints, preferences } = req.body;

    if (!requirements || !Array.isArray(requirements) || requirements.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Requirements array is required and must not be empty',
          code: 'MISSING_REQUIREMENTS'
        }
      });
    }

    // Validate each requirement
    for (const requirement of requirements) {
      if (!requirement.type || !requirement.description) {
        return res.status(400).json({
          error: {
            message: 'Each requirement must have type and description',
            code: 'INVALID_REQUIREMENT_FORMAT'
          }
        });
      }

      const validTypes = ['functional', 'non-functional', 'technical', 'business', 'security'];
      if (!validTypes.includes(requirement.type)) {
        return res.status(400).json({
          error: {
            message: `Requirement type must be one of: ${validTypes.join(', ')}`,
            code: 'INVALID_REQUIREMENT_TYPE'
          }
        });
      }
    }

    // Validate constraints if provided
    if (constraints) {
      const validConstraints = ['budget', 'timeline', 'technology', 'team_size', 'compliance'];
      for (const constraint of Object.keys(constraints)) {
        if (!validConstraints.includes(constraint)) {
          return res.status(400).json({
            error: {
              message: `Invalid constraint: ${constraint}`,
              code: 'INVALID_CONSTRAINT'
            }
          });
        }
      }
    }

    // Validate preferences if provided
    if (preferences) {
      const validPreferences = ['architecture', 'technologies', 'deployment', 'testing'];
      for (const preference of Object.keys(preferences)) {
        if (!validPreferences.includes(preference)) {
          return res.status(400).json({
            error: {
              message: `Invalid preference: ${preference}`,
              code: 'INVALID_PREFERENCE'
            }
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Planning request validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Planning validation failed',
        code: 'PLANNING_VALIDATION_ERROR'
      }
    });
  }
};

const validateProjectPlan = (req, res, next) => {
  try {
    const { projectType, features, architecture, integrations } = req.body;

    // Validate project type
    const validProjectTypes = ['web', 'mobile', 'desktop', 'api', 'blockchain', 'ai'];
    if (!projectType || !validProjectTypes.includes(projectType)) {
      return res.status(400).json({
        error: {
          message: `Project type must be one of: ${validProjectTypes.join(', ')}`,
          code: 'INVALID_PROJECT_TYPE'
        }
      });
    }

    // Validate features
    if (!features || !Array.isArray(features) || features.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Features array is required and must not be empty',
          code: 'MISSING_FEATURES'
        }
      });
    }

    // Validate architecture requirements
    if (architecture) {
      const validPatterns = ['monolithic', 'microservices', 'serverless', 'event-driven', 'layered'];
      if (architecture.pattern && !validPatterns.includes(architecture.pattern)) {
        return res.status(400).json({
          error: {
            message: `Architecture pattern must be one of: ${validPatterns.join(', ')}`,
            code: 'INVALID_ARCHITECTURE_PATTERN'
          }
        });
      }
    }

    // Validate integrations
    if (integrations && Array.isArray(integrations)) {
      for (const integration of integrations) {
        if (!integration.type || !integration.service) {
          return res.status(400).json({
            error: {
              message: 'Each integration must have type and service',
              code: 'INVALID_INTEGRATION_FORMAT'
            }
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Project plan validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Project plan validation failed',
        code: 'PROJECT_PLAN_VALIDATION_ERROR'
      }
    });
  }
};

const validateFeaturePlan = (req, res, next) => {
  try {
    const { feature, complexity, dependencies, acceptance_criteria } = req.body;

    // Validate feature details
    if (!feature || !feature.name || !feature.description) {
      return res.status(400).json({
        error: {
          message: 'Feature must have name and description',
          code: 'INVALID_FEATURE_FORMAT'
        }
      });
    }

    // Validate complexity
    const validComplexities = ['low', 'medium', 'high', 'very_high'];
    if (complexity && !validComplexities.includes(complexity)) {
      return res.status(400).json({
        error: {
          message: `Complexity must be one of: ${validComplexities.join(', ')}`,
          code: 'INVALID_COMPLEXITY'
        }
      });
    }

    // Validate dependencies
    if (dependencies && Array.isArray(dependencies)) {
      for (const dep of dependencies) {
        if (!dep.type || !dep.name) {
          return res.status(400).json({
            error: {
              message: 'Each dependency must have type and name',
              code: 'INVALID_DEPENDENCY_FORMAT'
            }
          });
        }
      }
    }

    // Validate acceptance criteria
    if (acceptance_criteria && Array.isArray(acceptance_criteria)) {
      for (const criteria of acceptance_criteria) {
        if (!criteria.description || !criteria.testable) {
          return res.status(400).json({
            error: {
              message: 'Each acceptance criteria must have description and testable flag',
              code: 'INVALID_ACCEPTANCE_CRITERIA'
            }
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Feature plan validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Feature plan validation failed',
        code: 'FEATURE_PLAN_VALIDATION_ERROR'
      }
    });
  }
};

const validateArchitecturePlan = (req, res, next) => {
  try {
    const { architecture, components, data_flow, security } = req.body;

    // Validate architecture
    if (!architecture || !architecture.pattern) {
      return res.status(400).json({
        error: {
          message: 'Architecture pattern is required',
          code: 'MISSING_ARCHITECTURE_PATTERN'
        }
      });
    }

    // Validate components
    if (!components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Components array is required and must not be empty',
          code: 'MISSING_COMPONENTS'
        }
      });
    }

    for (const component of components) {
      if (!component.name || !component.responsibility) {
        return res.status(400).json({
          error: {
            message: 'Each component must have name and responsibility',
            code: 'INVALID_COMPONENT_FORMAT'
          }
        });
      }
    }

    // Validate data flow
    if (data_flow && Array.isArray(data_flow)) {
      for (const flow of data_flow) {
        if (!flow.from || !flow.to || !flow.type) {
          return res.status(400).json({
            error: {
              message: 'Each data flow must have from, to, and type',
              code: 'INVALID_DATA_FLOW_FORMAT'
            }
          });
        }
      }
    }

    // Validate security requirements
    if (security && Array.isArray(security)) {
      for (const requirement of security) {
        if (!requirement.type || !requirement.description) {
          return res.status(400).json({
            error: {
              message: 'Each security requirement must have type and description',
              code: 'INVALID_SECURITY_REQUIREMENT'
            }
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Architecture plan validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Architecture plan validation failed',
        code: 'ARCHITECTURE_PLAN_VALIDATION_ERROR'
      }
    });
  }
};

const validateDeploymentPlan = (req, res, next) => {
  try {
    const { environment, infrastructure, deployment_strategy, monitoring } = req.body;

    // Validate environment
    const validEnvironments = ['development', 'staging', 'production'];
    if (!environment || !validEnvironments.includes(environment)) {
      return res.status(400).json({
        error: {
          message: `Environment must be one of: ${validEnvironments.join(', ')}`,
          code: 'INVALID_ENVIRONMENT'
        }
      });
    }

    // Validate infrastructure
    if (!infrastructure || !infrastructure.provider) {
      return res.status(400).json({
        error: {
          message: 'Infrastructure provider is required',
          code: 'MISSING_INFRASTRUCTURE_PROVIDER'
        }
      });
    }

    const validProviders = ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'vercel', 'netlify'];
    if (!validProviders.includes(infrastructure.provider)) {
      return res.status(400).json({
        error: {
          message: `Infrastructure provider must be one of: ${validProviders.join(', ')}`,
          code: 'INVALID_INFRASTRUCTURE_PROVIDER'
        }
      });
    }

    // Validate deployment strategy
    if (deployment_strategy) {
      const validStrategies = ['blue-green', 'rolling', 'canary', 'recreate'];
      if (!validStrategies.includes(deployment_strategy)) {
        return res.status(400).json({
          error: {
            message: `Deployment strategy must be one of: ${validStrategies.join(', ')}`,
            code: 'INVALID_DEPLOYMENT_STRATEGY'
          }
        });
      }
    }

    // Validate monitoring requirements
    if (monitoring && Array.isArray(monitoring)) {
      for (const requirement of monitoring) {
        if (!requirement.type || !requirement.description) {
          return res.status(400).json({
            error: {
              message: 'Each monitoring requirement must have type and description',
              code: 'INVALID_MONITORING_REQUIREMENT'
            }
          });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Deployment plan validation error:', error);
    return res.status(500).json({
      error: {
        message: 'Deployment plan validation failed',
        code: 'DEPLOYMENT_PLAN_VALIDATION_ERROR'
      }
    });
  }
};

const checkPlanningQuota = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    
    if (!userId) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    const user = req.user;
    const subscription = user.subscription || 'free';

    const hasQuota = await plannerService.checkPlanningQuota(userId, subscription);
    
    if (!hasQuota) {
      return res.status(429).json({
        error: {
          message: `Planning quota exceeded for ${subscription} subscription`,
          code: 'PLANNING_QUOTA_EXCEEDED'
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Planning quota check error:', error);
    return res.status(500).json({
      error: {
        message: 'Planning quota check failed',
        code: 'PLANNING_QUOTA_ERROR'
      }
    });
  }
};

const trackPlanningUsage = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const planType = req.body.planType || 'general';
    const complexity = req.body.complexity || 'medium';
    const startTime = Date.now();
    
    req.planningTracking = {
      userId,
      planType,
      complexity,
      startTime
    };

    const originalJson = res.json;
    res.json = async function(data) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      try {
        await plannerService.trackPlanningUsage({
          userId,
          planType,
          complexity,
          duration,
          success: res.statusCode < 400,
          metadata: {
            statusCode: res.statusCode,
            timestamp: new Date()
          }
        });
      } catch (error) {
        logger.error('Failed to track planning usage:', error);
      }
      
      originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error('Planning usage tracking error:', error);
    next();
  }
};

module.exports = {
  validatePlanningRequest,
  validateProjectPlan,
  validateFeaturePlan,
  validateArchitecturePlan,
  validateDeploymentPlan,
  checkPlanningQuota,
  trackPlanningUsage
};