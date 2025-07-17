// Base types for CodeCraft platform

/**
 * Project types supported by CodeCraft
 */
const PROJECT_TYPES = {
  WEB: 'web',
  MOBILE: 'mobile',
  BLOCKCHAIN: 'blockchain',
  AI: 'ai',
  FULLSTACK: 'fullstack',
  BACKEND: 'backend',
  DEVOPS: 'devops'
};

/**
 * Agent specializations
 */
const AGENT_TYPES = {
  PLANNER: 'planner',
  STRUCTURE: 'structure',
  INTEGRATION: 'integration',
  WEB: 'web',
  MOBILE: 'mobile',
  BLOCKCHAIN: 'blockchain',
  AI: 'ai',
  BACKEND: 'backend',
  DEVOPS: 'devops'
};

/**
 * Integration types
 */
const INTEGRATION_TYPES = {
  PAYMENT: 'payment',
  BLOCKCHAIN: 'blockchain',
  AI: 'ai',
  DATABASE: 'database',
  CLOUD: 'cloud',
  SOCIAL: 'social',
  ANALYTICS: 'analytics',
  DEPLOYMENT: 'deployment'
};

/**
 * Task statuses
 */
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Validation check results
 */
const VALIDATION_STATUS = {
  PASSED: 'passed',
  FAILED: 'failed',
  WARNING: 'warning',
  SKIPPED: 'skipped'
};

/**
 * Project complexity levels
 */
const COMPLEXITY_LEVELS = {
  SIMPLE: 'simple',
  MEDIUM: 'medium',
  COMPLEX: 'complex',
  ENTERPRISE: 'enterprise'
};

/**
 * AI model types
 */
const AI_MODELS = {
  GPT4: 'gpt-4',
  GPT35_TURBO: 'gpt-3.5-turbo',
  CLAUDE3_OPUS: 'claude-3-opus',
  CLAUDE3_SONNET: 'claude-3-sonnet',
  CLAUDE3_HAIKU: 'claude-3-haiku',
  OLLAMA_LLAMA2: 'ollama/llama2',
  OLLAMA_CODELLAMA: 'ollama/codellama',
  OLLAMA_MISTRAL: 'ollama/mistral'
};

/**
 * Base project configuration interface
 */
class ProjectConfig {
  constructor({
    id = null,
    name = '',
    type = PROJECT_TYPES.WEB,
    description = '',
    version = '1.0.0',
    author = '',
    license = 'MIT',
    repository = null,
    outputDir = './generated-project',
    techStack = {},
    integrations = [],
    features = [],
    requirements = {},
    constraints = [],
    metadata = {}
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.description = description;
    this.version = version;
    this.author = author;
    this.license = license;
    this.repository = repository;
    this.outputDir = outputDir;
    this.techStack = techStack;
    this.integrations = integrations;
    this.features = features;
    this.requirements = requirements;
    this.constraints = constraints;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Agent configuration interface
 */
class AgentConfig {
  constructor({
    id = null,
    name = '',
    type = AGENT_TYPES.WEB,
    model = AI_MODELS.GPT4,
    capabilities = [],
    specializations = [],
    config = {},
    status = 'active',
    metadata = {}
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.model = model;
    this.capabilities = capabilities;
    this.specializations = specializations;
    this.config = config;
    this.status = status;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Integration configuration interface
 */
class IntegrationConfig {
  constructor({
    id = null,
    name = '',
    type = INTEGRATION_TYPES.PAYMENT,
    provider = '',
    purpose = '',
    implementation = 'rest',
    config = {},
    credentials = {},
    endpoints = [],
    webhooks = [],
    testing = {},
    documentation = '',
    status = 'active'
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.provider = provider;
    this.purpose = purpose;
    this.implementation = implementation;
    this.config = config;
    this.credentials = credentials;
    this.endpoints = endpoints;
    this.webhooks = webhooks;
    this.testing = testing;
    this.documentation = documentation;
    this.status = status;
    this.createdAt = new Date().toISOString();
  }
}

/**
 * Plan configuration interface
 */
class PlanConfig {
  constructor({
    id = null,
    projectId = null,
    name = '',
    description = '',
    type = PROJECT_TYPES.WEB,
    complexity = COMPLEXITY_LEVELS.MEDIUM,
    estimatedDuration = '',
    budgetEstimate = '',
    requirements = {},
    techStack = {},
    architecture = {},
    phases = [],
    integrations = [],
    security = {},
    testing = {},
    deployment = {},
    monitoring = {},
    risks = [],
    mitigations = [],
    validationChecks = [],
    productionReadiness = [],
    metadata = {}
  } = {}) {
    this.id = id;
    this.projectId = projectId;
    this.name = name;
    this.description = description;
    this.type = type;
    this.complexity = complexity;
    this.estimatedDuration = estimatedDuration;
    this.budgetEstimate = budgetEstimate;
    this.requirements = requirements;
    this.techStack = techStack;
    this.architecture = architecture;
    this.phases = phases;
    this.integrations = integrations;
    this.security = security;
    this.testing = testing;
    this.deployment = deployment;
    this.monitoring = monitoring;
    this.risks = risks;
    this.mitigations = mitigations;
    this.validationChecks = validationChecks;
    this.productionReadiness = productionReadiness;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Task interface
 */
class Task {
  constructor({
    id = null,
    name = '',
    description = '',
    type = 'general',
    status = TASK_STATUS.PENDING,
    priority = 'medium',
    assignee = null,
    estimatedDuration = '',
    actualDuration = '',
    dependencies = [],
    deliverables = [],
    notes = '',
    metadata = {}
  } = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.type = type;
    this.status = status;
    this.priority = priority;
    this.assignee = assignee;
    this.estimatedDuration = estimatedDuration;
    this.actualDuration = actualDuration;
    this.dependencies = dependencies;
    this.deliverables = deliverables;
    this.notes = notes;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
}

/**
 * Validation check interface
 */
class ValidationCheck {
  constructor({
    id = null,
    name = '',
    description = '',
    type = 'functionality',
    status = VALIDATION_STATUS.PASSED,
    result = '',
    error = null,
    criteria = '',
    automated = true,
    severity = 'medium',
    metadata = {}
  } = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.type = type;
    this.status = status;
    this.result = result;
    this.error = error;
    this.criteria = criteria;
    this.automated = automated;
    this.severity = severity;
    this.metadata = metadata;
    this.executedAt = new Date().toISOString();
  }
}

/**
 * API Response interface
 */
class APIResponse {
  constructor({
    success = false,
    data = null,
    error = null,
    message = '',
    code = null,
    timestamp = new Date().toISOString(),
    metadata = {}
  } = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.message = message;
    this.code = code;
    this.timestamp = timestamp;
    this.metadata = metadata;
  }
}

module.exports = {
  // Constants
  PROJECT_TYPES,
  AGENT_TYPES,
  INTEGRATION_TYPES,
  TASK_STATUS,
  VALIDATION_STATUS,
  COMPLEXITY_LEVELS,
  AI_MODELS,
  
  // Classes
  ProjectConfig,
  AgentConfig,
  IntegrationConfig,
  PlanConfig,
  Task,
  ValidationCheck,
  APIResponse
};