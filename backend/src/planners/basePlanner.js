const { logger } = require('../utils/logger');

class BasePlanner {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      includeTimeline: true,
      includeDependencies: true,
      includeRisks: true,
      includeResources: true,
      ...options
    };
    
    this.phases = [];
    this.tasks = [];
    this.dependencies = [];
    this.risks = [];
    this.resources = [];
    this.timeline = {};
    this.estimates = {};
  }

  async plan(input, context = {}) {
    throw new Error('plan method must be implemented by subclass');
  }

  validateInput(input, requiredFields = []) {
    if (!input) {
      throw new Error('Input is required for planning');
    }

    for (const field of requiredFields) {
      if (!(field in input)) {
        throw new Error(`Required field '${field}' is missing from input`);
      }
    }

    return true;
  }

  addPhase(phase) {
    if (!phase.id || !phase.name) {
      throw new Error('Phase must have id and name');
    }
    
    this.phases.push({
      id: phase.id,
      name: phase.name,
      description: phase.description || '',
      duration: phase.duration || 0,
      dependencies: phase.dependencies || [],
      tasks: phase.tasks || [],
      priority: phase.priority || 'medium',
      status: phase.status || 'pending',
      startDate: phase.startDate || null,
      endDate: phase.endDate || null
    });
  }

  addTask(task) {
    if (!task.id || !task.name) {
      throw new Error('Task must have id and name');
    }
    
    this.tasks.push({
      id: task.id,
      name: task.name,
      description: task.description || '',
      phase: task.phase || null,
      duration: task.duration || 0,
      effort: task.effort || 0,
      dependencies: task.dependencies || [],
      resources: task.resources || [],
      priority: task.priority || 'medium',
      complexity: task.complexity || 'medium',
      status: task.status || 'pending',
      tags: task.tags || [],
      deliverables: task.deliverables || []
    });
  }

  addDependency(fromTask, toTask, type = 'finish-to-start') {
    this.dependencies.push({
      from: fromTask,
      to: toTask,
      type: type,
      lag: 0
    });
  }

  addRisk(risk) {
    this.risks.push({
      id: risk.id || this.generateId('risk'),
      name: risk.name,
      description: risk.description || '',
      probability: risk.probability || 'medium',
      impact: risk.impact || 'medium',
      category: risk.category || 'general',
      mitigation: risk.mitigation || '',
      contingency: risk.contingency || '',
      owner: risk.owner || 'unassigned',
      status: risk.status || 'identified'
    });
  }

  addResource(resource) {
    this.resources.push({
      id: resource.id || this.generateId('resource'),
      name: resource.name,
      type: resource.type || 'human',
      role: resource.role || '',
      availability: resource.availability || 100,
      cost: resource.cost || 0,
      costType: resource.costType || 'hourly',
      skills: resource.skills || [],
      allocation: resource.allocation || []
    });
  }

  generateId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculateDuration(tasks = this.tasks) {
    return tasks.reduce((total, task) => total + (task.duration || 0), 0);
  }

  calculateEffort(tasks = this.tasks) {
    return tasks.reduce((total, task) => total + (task.effort || 0), 0);
  }

  estimateComplexity(items) {
    const complexityWeights = {
      low: 1,
      medium: 2,
      high: 3,
      very_high: 4
    };

    const totalWeight = items.reduce((sum, item) => {
      const weight = complexityWeights[item.complexity] || 2;
      return sum + weight;
    }, 0);

    const averageWeight = totalWeight / items.length;
    
    if (averageWeight <= 1.5) return 'low';
    if (averageWeight <= 2.5) return 'medium';
    if (averageWeight <= 3.5) return 'high';
    return 'very_high';
  }

  prioritizeTasks() {
    const priorityWeights = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      very_low: 1
    };

    return this.tasks.sort((a, b) => {
      const weightA = priorityWeights[a.priority] || 3;
      const weightB = priorityWeights[b.priority] || 3;
      return weightB - weightA;
    });
  }

  createTimeline() {
    if (!this.options.includeTimeline) return {};

    const timeline = {
      totalDuration: this.calculateDuration(),
      totalEffort: this.calculateEffort(),
      phases: this.phases.map(phase => ({
        ...phase,
        duration: this.calculateDuration(
          this.tasks.filter(task => task.phase === phase.id)
        )
      })),
      milestones: this.extractMilestones(),
      criticalPath: this.calculateCriticalPath()
    };

    this.timeline = timeline;
    return timeline;
  }

  extractMilestones() {
    const milestones = [];
    
    // Add phase completion milestones
    this.phases.forEach(phase => {
      milestones.push({
        id: `milestone_${phase.id}`,
        name: `${phase.name} Complete`,
        description: `Completion of ${phase.name} phase`,
        type: 'phase_completion',
        dependencies: [phase.id]
      });
    });

    // Add major deliverable milestones
    const majorDeliverables = this.tasks.filter(task => 
      task.deliverables && task.deliverables.length > 0
    );

    majorDeliverables.forEach(task => {
      task.deliverables.forEach(deliverable => {
        milestones.push({
          id: `milestone_${task.id}_${deliverable.replace(/\s+/g, '_')}`,
          name: deliverable,
          description: `Delivery of ${deliverable}`,
          type: 'deliverable',
          dependencies: [task.id]
        });
      });
    });

    return milestones;
  }

  calculateCriticalPath() {
    // Simplified critical path calculation
    // In a real implementation, this would use proper CPM algorithms
    
    const taskGraph = this.buildTaskGraph();
    const longestPaths = this.findLongestPaths(taskGraph);
    
    return longestPaths.reduce((longest, current) => 
      current.duration > longest.duration ? current : longest
    , { path: [], duration: 0 });
  }

  buildTaskGraph() {
    const graph = {};
    
    this.tasks.forEach(task => {
      graph[task.id] = {
        ...task,
        predecessors: [],
        successors: []
      };
    });

    this.dependencies.forEach(dep => {
      if (graph[dep.from] && graph[dep.to]) {
        graph[dep.from].successors.push(dep.to);
        graph[dep.to].predecessors.push(dep.from);
      }
    });

    return graph;
  }

  findLongestPaths(graph) {
    // Simplified longest path calculation
    const paths = [];
    const visited = new Set();

    const dfs = (nodeId, currentPath, currentDuration) => {
      if (visited.has(nodeId)) return;
      
      const node = graph[nodeId];
      if (!node) return;

      const newPath = [...currentPath, nodeId];
      const newDuration = currentDuration + (node.duration || 0);

      if (node.successors.length === 0) {
        paths.push({
          path: newPath,
          duration: newDuration
        });
      } else {
        node.successors.forEach(successorId => {
          dfs(successorId, newPath, newDuration);
        });
      }
    };

    // Find root nodes (no predecessors)
    const rootNodes = Object.keys(graph).filter(
      nodeId => graph[nodeId].predecessors.length === 0
    );

    rootNodes.forEach(rootId => dfs(rootId, [], 0));

    return paths;
  }

  assessRisks() {
    if (!this.options.includeRisks) return {};

    const riskAssessment = {
      totalRisks: this.risks.length,
      risksByCategory: this.groupBy(this.risks, 'category'),
      risksByProbability: this.groupBy(this.risks, 'probability'),
      risksByImpact: this.groupBy(this.risks, 'impact'),
      highPriorityRisks: this.risks.filter(risk => 
        (risk.probability === 'high' && risk.impact === 'high') ||
        (risk.probability === 'very_high') ||
        (risk.impact === 'very_high')
      ),
      riskScore: this.calculateRiskScore()
    };

    return riskAssessment;
  }

  calculateRiskScore() {
    const probabilityWeights = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    const impactWeights = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };

    const totalScore = this.risks.reduce((sum, risk) => {
      const probWeight = probabilityWeights[risk.probability] || 3;
      const impactWeight = impactWeights[risk.impact] || 3;
      return sum + (probWeight * impactWeight);
    }, 0);

    return this.risks.length > 0 ? totalScore / this.risks.length : 0;
  }

  planResources() {
    if (!this.options.includeResources) return {};

    const resourcePlan = {
      totalResources: this.resources.length,
      resourcesByType: this.groupBy(this.resources, 'type'),
      resourcesByRole: this.groupBy(this.resources, 'role'),
      totalCost: this.calculateTotalCost(),
      resourceUtilization: this.calculateResourceUtilization(),
      recommendations: this.generateResourceRecommendations()
    };

    return resourcePlan;
  }

  calculateTotalCost() {
    return this.resources.reduce((total, resource) => {
      const effort = this.calculateEffortForResource(resource.id);
      return total + (effort * (resource.cost || 0));
    }, 0);
  }

  calculateEffortForResource(resourceId) {
    return this.tasks.reduce((total, task) => {
      if (task.resources.includes(resourceId)) {
        return total + (task.effort || 0);
      }
      return total;
    }, 0);
  }

  calculateResourceUtilization() {
    return this.resources.map(resource => ({
      id: resource.id,
      name: resource.name,
      allocatedEffort: this.calculateEffortForResource(resource.id),
      availability: resource.availability,
      utilization: this.calculateEffortForResource(resource.id) / resource.availability * 100
    }));
  }

  generateResourceRecommendations() {
    const recommendations = [];
    const utilization = this.calculateResourceUtilization();

    // Check for over-allocated resources
    const overAllocated = utilization.filter(r => r.utilization > 100);
    if (overAllocated.length > 0) {
      recommendations.push({
        type: 'over_allocation',
        message: `${overAllocated.length} resources are over-allocated`,
        resources: overAllocated.map(r => r.name),
        suggestion: 'Consider reducing workload or adding additional resources'
      });
    }

    // Check for under-utilized resources
    const underUtilized = utilization.filter(r => r.utilization < 50);
    if (underUtilized.length > 0) {
      recommendations.push({
        type: 'under_utilization',
        message: `${underUtilized.length} resources are under-utilized`,
        resources: underUtilized.map(r => r.name),
        suggestion: 'Consider reassigning or reducing resource allocation'
      });
    }

    return recommendations;
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unspecified';
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  generateEstimates() {
    const estimates = {
      duration: {
        optimistic: this.calculateDuration() * 0.8,
        mostLikely: this.calculateDuration(),
        pessimistic: this.calculateDuration() * 1.5
      },
      effort: {
        optimistic: this.calculateEffort() * 0.8,
        mostLikely: this.calculateEffort(),
        pessimistic: this.calculateEffort() * 1.5
      },
      cost: {
        optimistic: this.calculateTotalCost() * 0.8,
        mostLikely: this.calculateTotalCost(),
        pessimistic: this.calculateTotalCost() * 1.5
      },
      confidence: this.calculateConfidence()
    };

    this.estimates = estimates;
    return estimates;
  }

  calculateConfidence() {
    let confidence = 80; // Base confidence

    // Reduce confidence based on risks
    const highRisks = this.risks.filter(r => 
      r.probability === 'high' || r.impact === 'high'
    ).length;
    confidence -= highRisks * 5;

    // Reduce confidence based on complexity
    const highComplexityTasks = this.tasks.filter(t => 
      t.complexity === 'high' || t.complexity === 'very_high'
    ).length;
    confidence -= highComplexityTasks * 3;

    // Reduce confidence if dependencies are complex
    if (this.dependencies.length > this.tasks.length * 0.5) {
      confidence -= 10;
    }

    return Math.max(20, Math.min(95, confidence));
  }

  createPlanResult(success = true, metadata = {}) {
    const result = {
      success,
      plan: {
        phases: this.phases,
        tasks: this.tasks,
        dependencies: this.dependencies,
        risks: this.risks,
        resources: this.resources
      },
      timeline: this.timeline,
      estimates: this.estimates,
      summary: {
        totalPhases: this.phases.length,
        totalTasks: this.tasks.length,
        totalDuration: this.calculateDuration(),
        totalEffort: this.calculateEffort(),
        totalCost: this.calculateTotalCost(),
        complexityLevel: this.estimateComplexity(this.tasks),
        riskLevel: this.assessRiskLevel(),
        confidence: this.estimates.confidence || this.calculateConfidence()
      },
      metadata: {
        planner: this.constructor.name,
        createdAt: new Date().toISOString(),
        options: this.options,
        ...metadata
      }
    };

    if (this.options.includeTimeline) {
      result.timeline = this.createTimeline();
    }

    if (this.options.includeRisks) {
      result.riskAssessment = this.assessRisks();
    }

    if (this.options.includeResources) {
      result.resourcePlan = this.planResources();
    }

    return result;
  }

  assessRiskLevel() {
    const riskScore = this.calculateRiskScore();
    
    if (riskScore < 5) return 'low';
    if (riskScore < 10) return 'medium';
    if (riskScore < 15) return 'high';
    return 'very_high';
  }

  createErrorResult(error, context = {}) {
    logger.error(`Planning failed in ${this.constructor.name}:`, {
      error: error.message,
      context
    });

    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'PLANNING_ERROR',
        planner: this.constructor.name
      },
      metadata: {
        planner: this.constructor.name,
        createdAt: new Date().toISOString(),
        context
      }
    };
  }

  async performAsyncPlanning(input, planningFunction) {
    try {
      const startTime = Date.now();
      const result = await planningFunction(input);
      const duration = Date.now() - startTime;
      
      logger.debug(`Planning completed in ${duration}ms`, {
        planner: this.constructor.name,
        phases: this.phases.length,
        tasks: this.tasks.length
      });
      
      return result;
    } catch (error) {
      logger.error(`Async planning failed:`, {
        planner: this.constructor.name,
        error: error.message
      });
      throw error;
    }
  }

  reset() {
    this.phases = [];
    this.tasks = [];
    this.dependencies = [];
    this.risks = [];
    this.resources = [];
    this.timeline = {};
    this.estimates = {};
  }

  exportToJSON() {
    return JSON.stringify({
      phases: this.phases,
      tasks: this.tasks,
      dependencies: this.dependencies,
      risks: this.risks,
      resources: this.resources,
      timeline: this.timeline,
      estimates: this.estimates
    }, null, 2);
  }

  importFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      
      this.phases = data.phases || [];
      this.tasks = data.tasks || [];
      this.dependencies = data.dependencies || [];
      this.risks = data.risks || [];
      this.resources = data.resources || [];
      this.timeline = data.timeline || {};
      this.estimates = data.estimates || {};
      
      return true;
    } catch (error) {
      logger.error('Failed to import plan from JSON:', error);
      return false;
    }
  }
}

module.exports = { BasePlanner };