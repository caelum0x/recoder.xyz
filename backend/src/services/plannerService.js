const { Plan, Template, User } = require('../models');
const { RequirementAnalyzer } = require('../analyzers/requirementAnalyzer');
const { DependencyAnalyzer } = require('../analyzers/dependencyAnalyzer');
const { IntegrationAnalyzer } = require('../analyzers/integrationAnalyzer');
const { SecurityAnalyzer } = require('../analyzers/securityAnalyzer');
const { ProductionGenerator } = require('../generators/productionGenerator');
const { ValidationService } = require('./validationService');
const { logger } = require('../utils/logger');

class PlannerService {
  constructor() {
    this.requirementAnalyzer = new RequirementAnalyzer();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.integrationAnalyzer = new IntegrationAnalyzer();
    this.securityAnalyzer = new SecurityAnalyzer();
    this.productionGenerator = new ProductionGenerator();
    this.validationService = new ValidationService();
  }

  /**
   * Create a comprehensive project plan
   * @param {string} description - Project description
   * @param {object} options - Planning options
   * @returns {object} Complete project plan
   */
  async createComprehensivePlan(description, options = {}) {
    try {
      const {
        type = 'web',
        userId,
        interactive = false,
        template = null,
        validate = true
      } = options;

      logger.info('Creating comprehensive plan', { description, type, userId });

      // Step 1: Analyze requirements
      const requirements = await this.requirementAnalyzer.analyze(description, {
        type,
        interactive,
        template
      });

      // Step 2: Analyze dependencies
      const dependencies = await this.dependencyAnalyzer.analyze(requirements);

      // Step 3: Analyze integrations
      const integrations = await this.integrationAnalyzer.analyze(requirements, dependencies);

      // Step 4: Analyze security requirements
      const security = await this.securityAnalyzer.analyze(requirements, integrations);

      // Step 5: Generate project structure
      const structure = await this.productionGenerator.generateStructure(requirements, {
        type,
        dependencies,
        integrations,
        security
      });

      // Step 6: Create implementation phases
      const phases = await this.createImplementationPhases(requirements, dependencies, integrations);

      // Step 7: Generate timeline
      const timeline = await this.generateTimeline(phases, requirements.complexity);

      // Step 8: Create resource estimates
      const resources = await this.estimateResources(requirements, dependencies, integrations);

      // Step 9: Generate documentation outline
      const documentation = await this.generateDocumentationOutline(requirements, structure);

      // Step 10: Create testing strategy
      const testing = await this.createTestingStrategy(requirements, structure, integrations);

      const plan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: this.generatePlanName(requirements),
        description,
        type,
        status: 'draft',
        requirements,
        dependencies,
        integrations,
        security,
        structure,
        phases,
        timeline,
        resources,
        documentation,
        testing,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: '1.0.0',
          generator: 'recoder-planner-v1'
        }
      };

      // Step 11: Validate plan if requested
      if (validate) {
        const validation = await this.validatePlan(plan);
        plan.validation = validation;
      }

      logger.info('Comprehensive plan created successfully', { 
        planId: plan.id, 
        phasesCount: phases.length,
        requirementsCount: requirements.features?.length || 0
      });

      return plan;

    } catch (error) {
      logger.error('Failed to create comprehensive plan:', error);
      throw error;
    }
  }

  /**
   * Create implementation phases
   * @param {object} requirements - Project requirements
   * @param {object} dependencies - Project dependencies
   * @param {object} integrations - Project integrations
   * @returns {array} Implementation phases
   */
  async createImplementationPhases(requirements, dependencies, integrations) {
    const phases = [];

    // Phase 1: Foundation
    phases.push({
      id: 'foundation',
      name: 'Foundation Setup',
      description: 'Set up project foundation and core infrastructure',
      priority: 'high',
      estimatedDuration: '1-2 weeks',
      dependencies: [],
      tasks: [
        'Initialize project structure',
        'Set up version control',
        'Configure development environment',
        'Set up basic CI/CD pipeline',
        'Install core dependencies',
        'Create basic configuration files'
      ],
      deliverables: [
        'Project repository',
        'Development environment setup',
        'Basic CI/CD pipeline',
        'Core configuration files'
      ]
    });

    // Phase 2: Core Development
    phases.push({
      id: 'core-development',
      name: 'Core Development',
      description: 'Implement core features and functionality',
      priority: 'high',
      estimatedDuration: '3-6 weeks',
      dependencies: ['foundation'],
      tasks: [
        'Implement core business logic',
        'Create data models',
        'Develop API endpoints',
        'Implement authentication',
        'Create basic UI components',
        'Set up database schema'
      ],
      deliverables: [
        'Core business logic',
        'API endpoints',
        'Authentication system',
        'Database schema',
        'Basic UI components'
      ]
    });

    // Phase 3: Integration
    if (integrations && integrations.required?.length > 0) {
      phases.push({
        id: 'integration',
        name: 'Third-party Integration',
        description: 'Integrate with external services and APIs',
        priority: 'medium',
        estimatedDuration: '2-4 weeks',
        dependencies: ['core-development'],
        tasks: integrations.required.map(integration => `Integrate ${integration.name}`),
        deliverables: integrations.required.map(integration => `${integration.name} integration`)
      });
    }

    // Phase 4: Security
    phases.push({
      id: 'security',
      name: 'Security Implementation',
      description: 'Implement security measures and hardening',
      priority: 'high',
      estimatedDuration: '1-2 weeks',
      dependencies: ['core-development'],
      tasks: [
        'Implement security headers',
        'Set up input validation',
        'Configure HTTPS',
        'Implement rate limiting',
        'Set up security monitoring',
        'Conduct security audit'
      ],
      deliverables: [
        'Security headers',
        'Input validation',
        'HTTPS configuration',
        'Rate limiting',
        'Security monitoring'
      ]
    });

    // Phase 5: Testing
    phases.push({
      id: 'testing',
      name: 'Testing & Quality Assurance',
      description: 'Comprehensive testing and quality assurance',
      priority: 'high',
      estimatedDuration: '2-3 weeks',
      dependencies: ['core-development', 'security'],
      tasks: [
        'Write unit tests',
        'Write integration tests',
        'Implement end-to-end tests',
        'Performance testing',
        'Security testing',
        'User acceptance testing'
      ],
      deliverables: [
        'Unit test suite',
        'Integration test suite',
        'E2E test suite',
        'Performance test results',
        'Security test results'
      ]
    });

    // Phase 6: Deployment
    phases.push({
      id: 'deployment',
      name: 'Deployment & Go-Live',
      description: 'Deploy to production and go-live activities',
      priority: 'high',
      estimatedDuration: '1-2 weeks',
      dependencies: ['testing'],
      tasks: [
        'Set up production environment',
        'Configure monitoring',
        'Set up logging',
        'Deploy application',
        'Configure backup systems',
        'Create deployment documentation'
      ],
      deliverables: [
        'Production environment',
        'Monitoring setup',
        'Logging configuration',
        'Deployed application',
        'Backup systems',
        'Deployment documentation'
      ]
    });

    // Phase 7: Maintenance
    phases.push({
      id: 'maintenance',
      name: 'Maintenance & Support',
      description: 'Ongoing maintenance and support',
      priority: 'medium',
      estimatedDuration: 'Ongoing',
      dependencies: ['deployment'],
      tasks: [
        'Monitor application performance',
        'Handle bug fixes',
        'Implement feature updates',
        'Security updates',
        'Performance optimization',
        'User support'
      ],
      deliverables: [
        'Monitoring reports',
        'Bug fixes',
        'Feature updates',
        'Security patches',
        'Performance improvements'
      ]
    });

    return phases;
  }

  /**
   * Generate project timeline
   * @param {array} phases - Implementation phases
   * @param {string} complexity - Project complexity
   * @returns {object} Project timeline
   */
  async generateTimeline(phases, complexity = 'medium') {
    const complexityMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      very_high: 2.0
    };

    const multiplier = complexityMultipliers[complexity] || 1.0;
    const timeline = {
      totalEstimatedDuration: 0,
      phases: {},
      milestones: [],
      criticalPath: []
    };

    let currentWeek = 0;
    const phaseMap = {};

    // Calculate phase durations and dependencies
    for (const phase of phases) {
      const baseDuration = this.parseDuration(phase.estimatedDuration);
      const adjustedDuration = Math.ceil(baseDuration * multiplier);
      
      // Calculate start week based on dependencies
      let startWeek = currentWeek;
      if (phase.dependencies?.length > 0) {
        const dependencyEndWeeks = phase.dependencies.map(depId => {
          const dep = phaseMap[depId];
          return dep ? dep.endWeek : 0;
        });
        startWeek = Math.max(...dependencyEndWeeks, currentWeek);
      }

      const endWeek = startWeek + adjustedDuration;
      
      phaseMap[phase.id] = {
        ...phase,
        startWeek,
        endWeek,
        duration: adjustedDuration
      };

      timeline.phases[phase.id] = {
        name: phase.name,
        startWeek,
        endWeek,
        duration: adjustedDuration,
        priority: phase.priority
      };

      // Add milestone
      timeline.milestones.push({
        name: `${phase.name} Complete`,
        week: endWeek,
        description: `Completion of ${phase.name} phase`,
        type: 'phase_completion'
      });

      // Update current week for independent phases
      if (phase.dependencies?.length === 0) {
        currentWeek = endWeek;
      }
    }

    // Calculate total duration
    timeline.totalEstimatedDuration = Math.max(...Object.values(timeline.phases).map(p => p.endWeek));

    // Identify critical path
    timeline.criticalPath = this.identifyCriticalPath(phaseMap);

    return timeline;
  }

  /**
   * Estimate project resources
   * @param {object} requirements - Project requirements
   * @param {object} dependencies - Project dependencies
   * @param {object} integrations - Project integrations
   * @returns {object} Resource estimates
   */
  async estimateResources(requirements, dependencies, integrations) {
    const resources = {
      team: {
        roles: [],
        totalSize: 0,
        skillsRequired: []
      },
      infrastructure: {
        servers: [],
        services: [],
        estimatedCost: 0
      },
      timeline: {
        development: 0,
        testing: 0,
        deployment: 0
      },
      budget: {
        development: 0,
        infrastructure: 0,
        thirdParty: 0,
        total: 0
      }
    };

    // Estimate team requirements
    const teamRoles = this.estimateTeamRoles(requirements, dependencies, integrations);
    resources.team.roles = teamRoles;
    resources.team.totalSize = teamRoles.reduce((sum, role) => sum + role.count, 0);
    resources.team.skillsRequired = this.extractSkillsRequired(requirements, dependencies);

    // Estimate infrastructure
    resources.infrastructure = await this.estimateInfrastructure(requirements, integrations);

    // Estimate timeline
    resources.timeline = this.estimateTimelineResources(requirements);

    // Estimate budget
    resources.budget = this.estimateBudget(resources.team, resources.infrastructure, integrations);

    return resources;
  }

  /**
   * Generate documentation outline
   * @param {object} requirements - Project requirements
   * @param {object} structure - Project structure
   * @returns {object} Documentation outline
   */
  async generateDocumentationOutline(requirements, structure) {
    return {
      sections: [
        {
          title: 'Project Overview',
          description: 'High-level project description and objectives',
          priority: 'high',
          estimatedPages: 3
        },
        {
          title: 'Architecture',
          description: 'System architecture and design decisions',
          priority: 'high',
          estimatedPages: 8
        },
        {
          title: 'API Documentation',
          description: 'Complete API reference and examples',
          priority: 'high',
          estimatedPages: 15
        },
        {
          title: 'User Guide',
          description: 'End-user documentation and tutorials',
          priority: 'medium',
          estimatedPages: 10
        },
        {
          title: 'Developer Guide',
          description: 'Development setup and contribution guidelines',
          priority: 'medium',
          estimatedPages: 12
        },
        {
          title: 'Deployment Guide',
          description: 'Installation and deployment instructions',
          priority: 'high',
          estimatedPages: 6
        },
        {
          title: 'Security',
          description: 'Security considerations and best practices',
          priority: 'high',
          estimatedPages: 4
        },
        {
          title: 'Troubleshooting',
          description: 'Common issues and solutions',
          priority: 'medium',
          estimatedPages: 5
        }
      ],
      totalEstimatedPages: 63,
      deliverables: [
        'README.md',
        'ARCHITECTURE.md',
        'API.md',
        'USER_GUIDE.md',
        'DEVELOPER_GUIDE.md',
        'DEPLOYMENT.md',
        'SECURITY.md',
        'TROUBLESHOOTING.md'
      ]
    };
  }

  /**
   * Create testing strategy
   * @param {object} requirements - Project requirements
   * @param {object} structure - Project structure
   * @param {object} integrations - Project integrations
   * @returns {object} Testing strategy
   */
  async createTestingStrategy(requirements, structure, integrations) {
    return {
      levels: [
        {
          name: 'Unit Testing',
          description: 'Test individual components in isolation',
          coverage: 80,
          tools: ['Jest', 'Mocha', 'Chai'],
          estimatedTests: Math.ceil((requirements.features?.length || 0) * 3)
        },
        {
          name: 'Integration Testing',
          description: 'Test interaction between components',
          coverage: 70,
          tools: ['Supertest', 'Postman', 'Newman'],
          estimatedTests: Math.ceil((integrations.required?.length || 0) * 2)
        },
        {
          name: 'End-to-End Testing',
          description: 'Test complete user workflows',
          coverage: 60,
          tools: ['Cypress', 'Selenium', 'Playwright'],
          estimatedTests: Math.ceil((requirements.userStories?.length || 0) * 1.5)
        },
        {
          name: 'Performance Testing',
          description: 'Test system performance under load',
          coverage: 40,
          tools: ['K6', 'JMeter', 'Artillery'],
          estimatedTests: 10
        },
        {
          name: 'Security Testing',
          description: 'Test security vulnerabilities',
          coverage: 30,
          tools: ['OWASP ZAP', 'Snyk', 'SonarQube'],
          estimatedTests: 15
        }
      ],
      automation: {
        cicd: true,
        coverage: 75,
        reportFormat: 'HTML + JSON',
        notifications: true
      },
      estimatedEffort: '2-3 weeks',
      resources: ['QA Engineer', 'DevOps Engineer']
    };
  }

  /**
   * Validate a project plan
   * @param {object} plan - Project plan to validate
   * @returns {object} Validation results
   */
  async validatePlan(plan) {
    const validation = {
      isValid: true,
      score: 0,
      issues: [],
      recommendations: [],
      checklist: []
    };

    try {
      // Validate plan structure
      const structureValidation = this.validatePlanStructure(plan);
      validation.issues.push(...structureValidation.issues);
      validation.recommendations.push(...structureValidation.recommendations);

      // Validate requirements
      const requirementsValidation = this.validateRequirements(plan.requirements);
      validation.issues.push(...requirementsValidation.issues);
      validation.recommendations.push(...requirementsValidation.recommendations);

      // Validate dependencies
      const dependencyValidation = this.validateDependencies(plan.dependencies);
      validation.issues.push(...dependencyValidation.issues);
      validation.recommendations.push(...dependencyValidation.recommendations);

      // Validate timeline
      const timelineValidation = this.validateTimeline(plan.timeline);
      validation.issues.push(...timelineValidation.issues);
      validation.recommendations.push(...timelineValidation.recommendations);

      // Calculate validation score
      const totalChecks = 50;
      const issueCount = validation.issues.length;
      validation.score = Math.max(0, ((totalChecks - issueCount) / totalChecks) * 100);
      validation.isValid = validation.score >= 70;

      // Generate checklist
      validation.checklist = this.generateValidationChecklist(plan);

      return validation;

    } catch (error) {
      logger.error('Plan validation failed:', error);
      validation.isValid = false;
      validation.issues.push({
        type: 'error',
        message: 'Validation process failed',
        details: error.message
      });
      return validation;
    }
  }

  /**
   * Save plan to database
   * @param {object} plan - Project plan
   * @param {string} userId - User ID
   * @returns {object} Saved plan
   */
  async savePlan(plan, userId) {
    try {
      const savedPlan = await Plan.create({
        ...plan,
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      logger.info('Plan saved successfully', { planId: savedPlan.id, userId });
      return savedPlan;

    } catch (error) {
      logger.error('Failed to save plan:', error);
      throw error;
    }
  }

  /**
   * Get user's plans
   * @param {string} userId - User ID
   * @param {object} options - Query options
   * @returns {object} User's plans
   */
  async getUserPlans(userId, options = {}) {
    const { limit = 20, offset = 0, type } = options;
    
    const where = { userId };
    if (type) {
      where.type = type;
    }

    const plans = await Plan.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'description', 'type', 'status', 'createdAt', 'updatedAt']
    });

    return {
      plans: plans.rows,
      pagination: {
        total: plans.count,
        limit,
        offset,
        totalPages: Math.ceil(plans.count / limit)
      }
    };
  }

  /**
   * Get specific plan
   * @param {string} planId - Plan ID
   * @param {string} userId - User ID
   * @returns {object} Plan details
   */
  async getPlan(planId, userId) {
    return await Plan.findOne({
      where: { id: planId, userId }
    });
  }

  /**
   * Update plan
   * @param {string} planId - Plan ID
   * @param {object} updates - Updates to apply
   * @param {string} userId - User ID
   * @returns {object} Updated plan
   */
  async updatePlan(planId, updates, userId) {
    const plan = await Plan.findOne({
      where: { id: planId, userId }
    });

    if (!plan) {
      return null;
    }

    await plan.update({
      ...updates,
      updatedAt: new Date()
    });

    return plan;
  }

  /**
   * Delete plan
   * @param {string} planId - Plan ID
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  async deletePlan(planId, userId) {
    const result = await Plan.destroy({
      where: { id: planId, userId }
    });

    return result > 0;
  }

  /**
   * Get planning templates
   * @param {string} type - Project type filter
   * @returns {array} Planning templates
   */
  async getTemplates(type = null) {
    const where = { category: 'planning' };
    if (type) {
      where.type = type;
    }

    return await Template.findAll({
      where,
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'description', 'type', 'category', 'variables', 'created_at']
    });
  }

  // Helper methods
  generatePlanName(requirements) {
    const type = requirements.type || 'Project';
    const timestamp = new Date().toISOString().split('T')[0];
    return `${type.charAt(0).toUpperCase() + type.slice(1)} Plan - ${timestamp}`;
  }

  parseDuration(duration) {
    const match = duration.match(/(\d+)(?:-(\d+))?\s*weeks?/);
    if (match) {
      const min = parseInt(match[1]);
      const max = parseInt(match[2]) || min;
      return (min + max) / 2;
    }
    return 4; // Default to 4 weeks
  }

  identifyCriticalPath(phaseMap) {
    const criticalPath = [];
    
    // Find the longest path through the phases
    const findLongestPath = (phaseId, visited = new Set()) => {
      if (visited.has(phaseId)) return 0;
      visited.add(phaseId);
      
      const phase = phaseMap[phaseId];
      if (!phase) return 0;
      
      let maxPath = phase.duration;
      
      // Check all phases that depend on this one
      for (const [id, p] of Object.entries(phaseMap)) {
        if (p.dependencies?.includes(phaseId)) {
          maxPath = Math.max(maxPath, phase.duration + findLongestPath(id, new Set(visited)));
        }
      }
      
      return maxPath;
    };
    
    // Find phases with no dependencies (start phases)
    const startPhases = Object.keys(phaseMap).filter(id => 
      !phaseMap[id].dependencies?.length
    );
    
    // Find the critical path starting from each start phase
    for (const startPhaseId of startPhases) {
      const pathLength = findLongestPath(startPhaseId);
      criticalPath.push({ phaseId: startPhaseId, length: pathLength });
    }
    
    return criticalPath.sort((a, b) => b.length - a.length);
  }

  estimateTeamRoles(requirements, dependencies, integrations) {
    const roles = [];
    
    // Base roles
    roles.push({ name: 'Project Manager', count: 1, skills: ['Project Management', 'Agile'] });
    roles.push({ name: 'Backend Developer', count: 2, skills: ['Node.js', 'Databases', 'APIs'] });
    roles.push({ name: 'Frontend Developer', count: 1, skills: ['React', 'JavaScript', 'CSS'] });
    roles.push({ name: 'DevOps Engineer', count: 1, skills: ['CI/CD', 'Docker', 'Cloud'] });
    roles.push({ name: 'QA Engineer', count: 1, skills: ['Testing', 'Automation', 'Quality Assurance'] });
    
    // Additional roles based on requirements
    if (requirements.type === 'mobile') {
      roles.push({ name: 'Mobile Developer', count: 1, skills: ['React Native', 'iOS', 'Android'] });
    }
    
    if (requirements.type === 'blockchain') {
      roles.push({ name: 'Blockchain Developer', count: 1, skills: ['Solidity', 'Web3', 'Smart Contracts'] });
    }
    
    if (requirements.type === 'ai') {
      roles.push({ name: 'AI/ML Engineer', count: 1, skills: ['Python', 'TensorFlow', 'Machine Learning'] });
    }
    
    if (integrations?.required?.length > 3) {
      roles.push({ name: 'Integration Specialist', count: 1, skills: ['APIs', 'Webhooks', 'Third-party Services'] });
    }
    
    return roles;
  }

  extractSkillsRequired(requirements, dependencies) {
    const skills = new Set();
    
    // Skills from project type
    const typeSkills = {
      web: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js'],
      mobile: ['React Native', 'iOS', 'Android', 'Mobile Development'],
      blockchain: ['Solidity', 'Web3', 'Smart Contracts', 'Blockchain'],
      ai: ['Python', 'TensorFlow', 'Machine Learning', 'Data Science'],
      fullstack: ['Full Stack Development', 'Frontend', 'Backend', 'Database']
    };
    
    const projectTypeSkills = typeSkills[requirements.type] || typeSkills.web;
    projectTypeSkills.forEach(skill => skills.add(skill));
    
    // Skills from dependencies
    if (dependencies?.backend) {
      dependencies.backend.forEach(dep => skills.add(dep.name));
    }
    if (dependencies?.frontend) {
      dependencies.frontend.forEach(dep => skills.add(dep.name));
    }
    if (dependencies?.database) {
      dependencies.database.forEach(dep => skills.add(dep.name));
    }
    
    return Array.from(skills);
  }

  async estimateInfrastructure(requirements, integrations) {
    const infrastructure = {
      servers: [
        { name: 'Web Server', type: 'application', specs: '2 CPU, 4GB RAM', cost: 50 },
        { name: 'Database Server', type: 'database', specs: '2 CPU, 8GB RAM', cost: 80 },
        { name: 'Cache Server', type: 'cache', specs: '1 CPU, 2GB RAM', cost: 30 }
      ],
      services: [
        { name: 'Load Balancer', type: 'networking', cost: 20 },
        { name: 'CDN', type: 'content', cost: 15 },
        { name: 'Monitoring', type: 'observability', cost: 25 }
      ],
      estimatedCost: 220
    };
    
    // Add additional infrastructure based on requirements
    if (requirements.type === 'ai') {
      infrastructure.servers.push({ 
        name: 'AI Processing Server', 
        type: 'compute', 
        specs: '8 CPU, 32GB RAM, GPU', 
        cost: 300 
      });
      infrastructure.estimatedCost += 300;
    }
    
    if (integrations?.required?.length > 5) {
      infrastructure.services.push({ 
        name: 'API Gateway', 
        type: 'integration', 
        cost: 40 
      });
      infrastructure.estimatedCost += 40;
    }
    
    return infrastructure;
  }

  estimateTimelineResources(requirements) {
    const baseWeeks = {
      development: 8,
      testing: 2,
      deployment: 1
    };
    
    const complexityMultiplier = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      very_high: 2.0
    }[requirements.complexity] || 1.0;
    
    return {
      development: Math.ceil(baseWeeks.development * complexityMultiplier),
      testing: Math.ceil(baseWeeks.testing * complexityMultiplier),
      deployment: Math.ceil(baseWeeks.deployment * complexityMultiplier)
    };
  }

  estimateBudget(team, infrastructure, integrations) {
    const developerRate = 100; // per hour
    const workingHoursPerWeek = 40;
    const totalDevelopmentWeeks = 12;
    
    const developmentCost = team.roles.reduce((total, role) => {
      return total + (role.count * developerRate * workingHoursPerWeek * totalDevelopmentWeeks);
    }, 0);
    
    const infrastructureCost = infrastructure.estimatedCost * 12; // per year
    
    const thirdPartyCost = integrations?.required?.reduce((total, integration) => {
      return total + (integration.estimatedCost || 0);
    }, 0) || 0;
    
    return {
      development: developmentCost,
      infrastructure: infrastructureCost,
      thirdParty: thirdPartyCost,
      total: developmentCost + infrastructureCost + thirdPartyCost
    };
  }

  validatePlanStructure(plan) {
    const issues = [];
    const recommendations = [];
    
    if (!plan.name) {
      issues.push({ type: 'error', message: 'Plan name is required' });
    }
    
    if (!plan.description) {
      issues.push({ type: 'error', message: 'Plan description is required' });
    }
    
    if (!plan.requirements) {
      issues.push({ type: 'error', message: 'Requirements are required' });
    }
    
    if (!plan.phases || plan.phases.length === 0) {
      issues.push({ type: 'error', message: 'At least one phase is required' });
    }
    
    return { issues, recommendations };
  }

  validateRequirements(requirements) {
    const issues = [];
    const recommendations = [];
    
    if (!requirements.features || requirements.features.length === 0) {
      issues.push({ type: 'warning', message: 'No features specified' });
    }
    
    if (!requirements.userStories || requirements.userStories.length === 0) {
      recommendations.push({ type: 'suggestion', message: 'Consider adding user stories for better clarity' });
    }
    
    return { issues, recommendations };
  }

  validateDependencies(dependencies) {
    const issues = [];
    const recommendations = [];
    
    if (!dependencies) {
      issues.push({ type: 'warning', message: 'No dependencies specified' });
    }
    
    return { issues, recommendations };
  }

  validateTimeline(timeline) {
    const issues = [];
    const recommendations = [];
    
    if (!timeline.totalEstimatedDuration) {
      issues.push({ type: 'error', message: 'Total estimated duration is required' });
    }
    
    if (timeline.totalEstimatedDuration > 52) {
      recommendations.push({ type: 'suggestion', message: 'Consider breaking down the project into smaller phases' });
    }
    
    return { issues, recommendations };
  }

  generateValidationChecklist(plan) {
    return [
      { item: 'Project name defined', status: !!plan.name },
      { item: 'Project description provided', status: !!plan.description },
      { item: 'Requirements specified', status: !!plan.requirements },
      { item: 'Dependencies identified', status: !!plan.dependencies },
      { item: 'Phases defined', status: !!plan.phases && plan.phases.length > 0 },
      { item: 'Timeline estimated', status: !!plan.timeline },
      { item: 'Resources estimated', status: !!plan.resources },
      { item: 'Testing strategy defined', status: !!plan.testing },
      { item: 'Security considerations included', status: !!plan.security },
      { item: 'Documentation outlined', status: !!plan.documentation }
    ];
  }
}

module.exports = { PlannerService };