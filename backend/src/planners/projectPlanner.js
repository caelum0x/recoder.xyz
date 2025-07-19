const { BasePlanner } = require('./basePlanner');
const { logger } = require('../utils/logger');

class ProjectPlanner extends BasePlanner {
  constructor(options = {}) {
    super(options);
    this.projectMethodologies = {
      waterfall: this.createWaterfallPhases.bind(this),
      agile: this.createAgilePhases.bind(this),
      scrum: this.createScrumPhases.bind(this),
      kanban: this.createKanbanPhases.bind(this),
      hybrid: this.createHybridPhases.bind(this)
    };
  }

  async plan(input, context = {}) {
    try {
      this.validateInput(input, ['projectName', 'projectType']);

      const result = await this.performAsyncPlanning(input, async () => {
        // Reset previous planning data
        this.reset();

        const projectConfig = this.analyzeProject(input);
        const methodology = this.selectMethodology(input, projectConfig);
        
        // Create phases based on methodology
        await this.createProjectPhases(methodology, projectConfig);
        
        // Add project-specific tasks
        await this.createProjectTasks(projectConfig);
        
        // Add dependencies between tasks
        this.createTaskDependencies();
        
        // Identify and add risks
        this.identifyProjectRisks(projectConfig);
        
        // Plan resources
        this.planProjectResources(projectConfig);
        
        // Generate estimates
        this.generateEstimates();
        
        return this.createPlanResult(true, {
          projectType: input.projectType,
          methodology: methodology,
          scope: projectConfig.scope
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeProject(input) {
    const config = {
      name: input.projectName,
      type: input.projectType,
      scope: input.scope || 'medium',
      complexity: input.complexity || 'medium',
      duration: input.duration || null,
      budget: input.budget || null,
      teamSize: input.teamSize || 5,
      methodology: input.methodology || 'auto',
      stakeholders: input.stakeholders || [],
      requirements: input.requirements || [],
      constraints: input.constraints || [],
      technologies: input.technologies || [],
      platforms: input.platforms || [],
      features: input.features || []
    };

    // Auto-determine scope if not provided
    if (config.scope === 'auto') {
      config.scope = this.determineScope(config);
    }

    // Auto-determine complexity if not provided
    if (config.complexity === 'auto') {
      config.complexity = this.determineComplexity(config);
    }

    return config;
  }

  determineScope(config) {
    let scopeScore = 0;

    // Features count
    if (config.features.length > 20) scopeScore += 3;
    else if (config.features.length > 10) scopeScore += 2;
    else if (config.features.length > 5) scopeScore += 1;

    // Requirements count
    if (config.requirements.length > 50) scopeScore += 3;
    else if (config.requirements.length > 20) scopeScore += 2;
    else if (config.requirements.length > 10) scopeScore += 1;

    // Technologies count
    if (config.technologies.length > 10) scopeScore += 2;
    else if (config.technologies.length > 5) scopeScore += 1;

    // Platforms count
    if (config.platforms.length > 3) scopeScore += 2;
    else if (config.platforms.length > 1) scopeScore += 1;

    if (scopeScore >= 8) return 'large';
    if (scopeScore >= 5) return 'medium';
    return 'small';
  }

  determineComplexity(config) {
    let complexityScore = 0;

    // Project type complexity
    const typeComplexity = {
      'web': 2,
      'mobile': 3,
      'desktop': 3,
      'ai': 4,
      'blockchain': 4,
      'iot': 4,
      'enterprise': 4,
      'game': 3,
      'api': 2
    };
    complexityScore += typeComplexity[config.type] || 2;

    // Integration complexity
    if (config.technologies.some(tech => ['microservices', 'kubernetes', 'aws', 'azure'].includes(tech))) {
      complexityScore += 2;
    }

    // Database complexity
    if (config.technologies.some(tech => ['mongodb', 'postgresql', 'redis', 'elasticsearch'].includes(tech))) {
      complexityScore += 1;
    }

    // Real-time features
    if (config.features.some(feature => feature.includes('real-time') || feature.includes('websocket'))) {
      complexityScore += 2;
    }

    if (complexityScore >= 8) return 'very_high';
    if (complexityScore >= 6) return 'high';
    if (complexityScore >= 4) return 'medium';
    return 'low';
  }

  selectMethodology(input, config) {
    if (input.methodology && input.methodology !== 'auto') {
      return input.methodology;
    }

    // Auto-select methodology based on project characteristics
    if (config.type === 'research' || config.complexity === 'very_high') {
      return 'agile';
    }

    if (config.scope === 'large' && config.requirements.length > 30) {
      return 'waterfall';
    }

    if (config.teamSize <= 3) {
      return 'kanban';
    }

    if (config.type === 'web' || config.type === 'mobile') {
      return 'scrum';
    }

    return 'hybrid';
  }

  async createProjectPhases(methodology, config) {
    const phaseCreator = this.projectMethodologies[methodology];
    if (phaseCreator) {
      await phaseCreator(config);
    } else {
      throw new Error(`Unknown methodology: ${methodology}`);
    }
  }

  createWaterfallPhases(config) {
    const phases = [
      {
        id: 'requirements',
        name: 'Requirements Analysis',
        description: 'Gather and analyze project requirements',
        duration: this.estimatePhaseDuration('requirements', config),
        priority: 'critical'
      },
      {
        id: 'design',
        name: 'System Design',
        description: 'Design system architecture and components',
        duration: this.estimatePhaseDuration('design', config),
        priority: 'critical',
        dependencies: ['requirements']
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Develop the system according to design',
        duration: this.estimatePhaseDuration('implementation', config),
        priority: 'critical',
        dependencies: ['design']
      },
      {
        id: 'testing',
        name: 'Testing',
        description: 'Comprehensive system testing',
        duration: this.estimatePhaseDuration('testing', config),
        priority: 'critical',
        dependencies: ['implementation']
      },
      {
        id: 'deployment',
        name: 'Deployment',
        description: 'Deploy system to production environment',
        duration: this.estimatePhaseDuration('deployment', config),
        priority: 'critical',
        dependencies: ['testing']
      },
      {
        id: 'maintenance',
        name: 'Maintenance',
        description: 'Ongoing maintenance and support',
        duration: this.estimatePhaseDuration('maintenance', config),
        priority: 'medium',
        dependencies: ['deployment']
      }
    ];

    phases.forEach(phase => this.addPhase(phase));
  }

  createAgilePhases(config) {
    const sprintCount = Math.ceil(this.estimateProjectDuration(config) / 14); // 2-week sprints
    
    // Planning phase
    this.addPhase({
      id: 'planning',
      name: 'Project Planning',
      description: 'Initial project planning and backlog creation',
      duration: 10,
      priority: 'critical'
    });

    // Sprint phases
    for (let i = 1; i <= sprintCount; i++) {
      this.addPhase({
        id: `sprint_${i}`,
        name: `Sprint ${i}`,
        description: `Development sprint ${i}`,
        duration: 14,
        priority: 'critical',
        dependencies: i === 1 ? ['planning'] : [`sprint_${i-1}`]
      });
    }

    // Release phase
    this.addPhase({
      id: 'release',
      name: 'Release',
      description: 'Final release preparation and deployment',
      duration: 7,
      priority: 'critical',
      dependencies: [`sprint_${sprintCount}`]
    });
  }

  createScrumPhases(config) {
    const sprintCount = Math.ceil(this.estimateProjectDuration(config) / 14);
    
    this.addPhase({
      id: 'sprint_0',
      name: 'Sprint 0 (Setup)',
      description: 'Project setup, team formation, and initial planning',
      duration: 14,
      priority: 'critical'
    });

    for (let i = 1; i <= sprintCount; i++) {
      this.addPhase({
        id: `sprint_${i}`,
        name: `Sprint ${i}`,
        description: `Development sprint ${i} with planning, development, review, and retrospective`,
        duration: 14,
        priority: 'critical',
        dependencies: i === 1 ? ['sprint_0'] : [`sprint_${i-1}`]
      });
    }

    this.addPhase({
      id: 'hardening',
      name: 'Hardening Sprint',
      description: 'Final testing, bug fixes, and release preparation',
      duration: 14,
      priority: 'critical',
      dependencies: [`sprint_${sprintCount}`]
    });
  }

  createKanbanPhases(config) {
    const phases = [
      {
        id: 'backlog',
        name: 'Backlog Management',
        description: 'Continuous backlog refinement and prioritization',
        duration: this.estimateProjectDuration(config),
        priority: 'high'
      },
      {
        id: 'development',
        name: 'Continuous Development',
        description: 'Ongoing development with continuous delivery',
        duration: this.estimateProjectDuration(config) * 0.8,
        priority: 'critical',
        dependencies: ['backlog']
      },
      {
        id: 'delivery',
        name: 'Continuous Delivery',
        description: 'Continuous integration and delivery pipeline',
        duration: this.estimateProjectDuration(config) * 0.3,
        priority: 'high',
        dependencies: ['development']
      }
    ];

    phases.forEach(phase => this.addPhase(phase));
  }

  createHybridPhases(config) {
    // Combine waterfall for planning and agile for development
    this.addPhase({
      id: 'analysis',
      name: 'Analysis & Planning',
      description: 'Requirements analysis and high-level planning',
      duration: this.estimatePhaseDuration('requirements', config) + 
                this.estimatePhaseDuration('design', config) * 0.5,
      priority: 'critical'
    });

    const developmentDuration = this.estimatePhaseDuration('implementation', config);
    const iterationCount = Math.ceil(developmentDuration / 21); // 3-week iterations

    for (let i = 1; i <= iterationCount; i++) {
      this.addPhase({
        id: `iteration_${i}`,
        name: `Development Iteration ${i}`,
        description: `Development iteration ${i} with design, code, and test`,
        duration: 21,
        priority: 'critical',
        dependencies: i === 1 ? ['analysis'] : [`iteration_${i-1}`]
      });
    }

    this.addPhase({
      id: 'finalization',
      name: 'Finalization & Deployment',
      description: 'Final testing, documentation, and deployment',
      duration: this.estimatePhaseDuration('testing', config) * 0.5 + 
                this.estimatePhaseDuration('deployment', config),
      priority: 'critical',
      dependencies: [`iteration_${iterationCount}`]
    });
  }

  estimatePhaseDuration(phaseName, config) {
    const baseDurations = {
      requirements: 15,
      design: 20,
      implementation: 60,
      testing: 20,
      deployment: 10,
      maintenance: 30
    };

    const scopeMultipliers = {
      small: 0.7,
      medium: 1.0,
      large: 1.5
    };

    const complexityMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.3,
      very_high: 1.6
    };

    const baseDuration = baseDurations[phaseName] || 10;
    const scopeMultiplier = scopeMultipliers[config.scope] || 1.0;
    const complexityMultiplier = complexityMultipliers[config.complexity] || 1.0;

    return Math.round(baseDuration * scopeMultiplier * complexityMultiplier);
  }

  estimateProjectDuration(config) {
    const totalDuration = Object.keys({
      requirements: 1, design: 1, implementation: 1, 
      testing: 1, deployment: 1
    }).reduce((sum, phase) => sum + this.estimatePhaseDuration(phase, config), 0);

    return totalDuration;
  }

  async createProjectTasks(config) {
    // Requirements tasks
    this.createRequirementsTasks(config);
    
    // Design tasks
    this.createDesignTasks(config);
    
    // Implementation tasks
    this.createImplementationTasks(config);
    
    // Testing tasks
    this.createTestingTasks(config);
    
    // Deployment tasks
    this.createDeploymentTasks(config);
  }

  createRequirementsTasks(config) {
    const tasks = [
      {
        id: 'stakeholder_analysis',
        name: 'Stakeholder Analysis',
        description: 'Identify and analyze project stakeholders',
        phase: 'requirements',
        duration: 3,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'requirements_gathering',
        name: 'Requirements Gathering',
        description: 'Collect functional and non-functional requirements',
        phase: 'requirements',
        duration: 8,
        effort: 40,
        priority: 'critical',
        complexity: 'medium'
      },
      {
        id: 'requirements_analysis',
        name: 'Requirements Analysis',
        description: 'Analyze and prioritize requirements',
        phase: 'requirements',
        duration: 5,
        effort: 24,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['requirements_gathering']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  createDesignTasks(config) {
    const tasks = [
      {
        id: 'architecture_design',
        name: 'Architecture Design',
        description: 'Design system architecture and components',
        phase: 'design',
        duration: 10,
        effort: 60,
        priority: 'critical',
        complexity: 'high'
      },
      {
        id: 'ui_design',
        name: 'UI/UX Design',
        description: 'Design user interface and experience',
        phase: 'design',
        duration: 8,
        effort: 40,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'database_design',
        name: 'Database Design',
        description: 'Design database schema and relationships',
        phase: 'design',
        duration: 5,
        effort: 30,
        priority: 'high',
        complexity: 'medium'
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  createImplementationTasks(config) {
    const features = config.features.length > 0 ? config.features : ['core_functionality'];
    
    features.forEach((feature, index) => {
      this.addTask({
        id: `implement_${feature.replace(/\s+/g, '_').toLowerCase()}`,
        name: `Implement ${feature}`,
        description: `Develop ${feature} functionality`,
        phase: 'implementation',
        duration: this.estimateFeatureDuration(feature, config),
        effort: this.estimateFeatureEffort(feature, config),
        priority: index < 3 ? 'critical' : 'high',
        complexity: this.estimateFeatureComplexity(feature, config),
        tags: ['development', 'feature']
      });
    });

    // Add integration tasks
    this.addTask({
      id: 'system_integration',
      name: 'System Integration',
      description: 'Integrate all system components',
      phase: 'implementation',
      duration: 8,
      effort: 40,
      priority: 'critical',
      complexity: 'high',
      dependencies: features.map(f => `implement_${f.replace(/\s+/g, '_').toLowerCase()}`)
    });
  }

  createTestingTasks(config) {
    const tasks = [
      {
        id: 'unit_testing',
        name: 'Unit Testing',
        description: 'Write and execute unit tests',
        phase: 'testing',
        duration: 8,
        effort: 40,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'integration_testing',
        name: 'Integration Testing',
        description: 'Test system integration points',
        phase: 'testing',
        duration: 6,
        effort: 30,
        priority: 'high',
        complexity: 'medium',
        dependencies: ['unit_testing']
      },
      {
        id: 'user_acceptance_testing',
        name: 'User Acceptance Testing',
        description: 'Conduct UAT with stakeholders',
        phase: 'testing',
        duration: 10,
        effort: 32,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['integration_testing']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  createDeploymentTasks(config) {
    const tasks = [
      {
        id: 'deployment_preparation',
        name: 'Deployment Preparation',
        description: 'Prepare deployment environment and scripts',
        phase: 'deployment',
        duration: 3,
        effort: 16,
        priority: 'high',
        complexity: 'medium'
      },
      {
        id: 'production_deployment',
        name: 'Production Deployment',
        description: 'Deploy system to production environment',
        phase: 'deployment',
        duration: 2,
        effort: 12,
        priority: 'critical',
        complexity: 'high',
        dependencies: ['deployment_preparation']
      },
      {
        id: 'post_deployment_testing',
        name: 'Post-Deployment Testing',
        description: 'Verify system functionality in production',
        phase: 'deployment',
        duration: 3,
        effort: 16,
        priority: 'critical',
        complexity: 'medium',
        dependencies: ['production_deployment']
      }
    ];

    tasks.forEach(task => this.addTask(task));
  }

  estimateFeatureDuration(feature, config) {
    const complexityMultiplier = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      very_high: 2.0
    }[config.complexity] || 1.0;

    return Math.round(5 * complexityMultiplier);
  }

  estimateFeatureEffort(feature, config) {
    const complexityMultiplier = {
      low: 0.7,
      medium: 1.0,
      high: 1.4,
      very_high: 2.0
    }[config.complexity] || 1.0;

    return Math.round(24 * complexityMultiplier);
  }

  estimateFeatureComplexity(feature, config) {
    const complexFeatures = ['authentication', 'payment', 'real-time', 'ai', 'machine learning'];
    
    if (complexFeatures.some(cf => feature.toLowerCase().includes(cf))) {
      return 'high';
    }
    
    return config.complexity === 'very_high' ? 'high' : 'medium';
  }

  createTaskDependencies() {
    // Implementation tasks depend on design completion
    const implementationTasks = this.tasks.filter(t => t.phase === 'implementation');
    const designTasks = this.tasks.filter(t => t.phase === 'design');
    
    implementationTasks.forEach(implTask => {
      designTasks.forEach(designTask => {
        this.addDependency(designTask.id, implTask.id);
      });
    });

    // Testing tasks depend on implementation
    const testingTasks = this.tasks.filter(t => t.phase === 'testing');
    implementationTasks.forEach(implTask => {
      testingTasks.forEach(testTask => {
        this.addDependency(implTask.id, testTask.id);
      });
    });
  }

  identifyProjectRisks(config) {
    // Technology risks
    if (config.technologies.some(tech => ['ai', 'blockchain', 'iot'].includes(tech))) {
      this.addRisk({
        name: 'Technology Risk',
        description: 'Risk associated with cutting-edge technologies',
        probability: 'medium',
        impact: 'high',
        category: 'technical',
        mitigation: 'Conduct proof of concepts and technical spikes'
      });
    }

    // Scope risks
    if (config.scope === 'large') {
      this.addRisk({
        name: 'Scope Creep',
        description: 'Risk of requirements expanding during development',
        probability: 'high',
        impact: 'medium',
        category: 'scope',
        mitigation: 'Implement change control process'
      });
    }

    // Team risks
    if (config.teamSize < 3) {
      this.addRisk({
        name: 'Resource Constraint',
        description: 'Limited team size may impact delivery',
        probability: 'medium',
        impact: 'medium',
        category: 'resource',
        mitigation: 'Cross-train team members and consider contractors'
      });
    }

    // Complexity risks
    if (config.complexity === 'very_high') {
      this.addRisk({
        name: 'Technical Complexity',
        description: 'High technical complexity may lead to delays',
        probability: 'high',
        impact: 'high',
        category: 'technical',
        mitigation: 'Break down complex features into smaller components'
      });
    }
  }

  planProjectResources(config) {
    // Project Manager
    this.addResource({
      name: 'Project Manager',
      type: 'human',
      role: 'project_manager',
      availability: 100,
      cost: 150,
      costType: 'hourly',
      skills: ['project_management', 'leadership', 'communication']
    });

    // Technical Lead
    this.addResource({
      name: 'Technical Lead',
      type: 'human',
      role: 'tech_lead',
      availability: 100,
      cost: 130,
      costType: 'hourly',
      skills: ['architecture', 'technical_leadership', 'code_review']
    });

    // Developers
    const developerCount = Math.max(2, Math.min(config.teamSize - 2, 6));
    for (let i = 1; i <= developerCount; i++) {
      this.addResource({
        name: `Developer ${i}`,
        type: 'human',
        role: 'developer',
        availability: 100,
        cost: 100,
        costType: 'hourly',
        skills: ['programming', 'testing', 'debugging']
      });
    }

    // QA Engineer
    if (config.teamSize > 3) {
      this.addResource({
        name: 'QA Engineer',
        type: 'human',
        role: 'qa',
        availability: 100,
        cost: 80,
        costType: 'hourly',
        skills: ['testing', 'quality_assurance', 'automation']
      });
    }

    // DevOps Engineer
    if (config.scope === 'large' || config.technologies.includes('cloud')) {
      this.addResource({
        name: 'DevOps Engineer',
        type: 'human',
        role: 'devops',
        availability: 50,
        cost: 120,
        costType: 'hourly',
        skills: ['deployment', 'automation', 'monitoring']
      });
    }
  }
}

module.exports = { ProjectPlanner };