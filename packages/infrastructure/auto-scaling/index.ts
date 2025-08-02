interface AutoScalingConfig {
  provider: 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'docker' | 'custom';
  resources: Array<{
    name: string;
    type: 'compute' | 'storage' | 'database' | 'queue' | 'cache' | 'load-balancer';
    identifier: string; // resource ID/name
    region?: string;
    zone?: string;
  }>;
  scaling: {
    horizontal: {
      enabled: boolean;
      minInstances: number;
      maxInstances: number;
      targetCpuPercentage: number;
      targetMemoryPercentage: number;
      targetRequestsPerSecond: number;
      scaleUpCooldown: number; // seconds
      scaleDownCooldown: number; // seconds
      scaleUpPolicy: 'conservative' | 'aggressive' | 'predictive';
      scaleDownPolicy: 'conservative' | 'aggressive' | 'scheduled';
    };
    vertical: {
      enabled: boolean;
      minCpu: number; // cores
      maxCpu: number;
      minMemory: number; // GB
      maxMemory: number;
      cpuStepSize: number; // cores
      memoryStepSize: number; // GB
      resizeCooldown: number; // seconds
    };
    predictive: {
      enabled: boolean;
      lookAheadMinutes: number;
      historicalDataDays: number;
      trafficPatterns: Array<{
        name: string;
        schedule: string; // cron expression
        scaleFactor: number;
        duration: number; // minutes
      }>;
      mlModel: {
        enabled: boolean;
        algorithm: 'linear-regression' | 'arima' | 'lstm' | 'prophet';
        accuracy: number; // percentage
        retrainInterval: number; // hours
      };
    };
  };
  metrics: {
    sources: Array<{
      type: 'prometheus' | 'cloudwatch' | 'stackdriver' | 'custom';
      endpoint: string;
      credentials?: Record<string, string>;
    }>;
    collection: {
      interval: number; // seconds
      retention: number; // days
    };
    thresholds: {
      cpu: { scaleUp: number; scaleDown: number };
      memory: { scaleUp: number; scaleDown: number };
      network: { scaleUp: number; scaleDown: number };
      disk: { scaleUp: number; scaleDown: number };
      queueDepth: { scaleUp: number; scaleDown: number };
      responseTime: { scaleUp: number; scaleDown: number };
      errorRate: { scaleUp: number; scaleDown: number };
      custom: Array<{
        name: string;
        scaleUp: number;
        scaleDown: number;
        weight: number;
      }>;
    };
  };
  policies: Array<{
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    conditions: Array<{
      metric: string;
      operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
      value: number;
      duration: number; // seconds
    }>;
    actions: Array<{
      type: 'scale-up' | 'scale-down' | 'scale-out' | 'scale-in' | 'notify' | 'custom';
      target: string;
      parameters: Record<string, any>;
    }>;
    schedule?: {
      enabled: boolean;
      timezone: string;
      rules: Array<{
        days: string[]; // ['monday', 'tuesday', ...]
        timeStart: string; // HH:MM
        timeEnd: string;
        action: 'scale-up' | 'scale-down';
        factor: number;
      }>;
    };
  }>;
  notifications: {
    enabled: boolean;
    channels: Array<{
      type: 'email' | 'slack' | 'webhook' | 'sms';
      config: Record<string, any>;
      events: ('scale-up' | 'scale-down' | 'scale-out' | 'scale-in' | 'error' | 'threshold-breach')[];
    }>;
  };
}

interface ResourceMetrics {
  resourceId: string;
  timestamp: Date;
  cpu: {
    usage: number; // percentage
    cores: number;
    utilization: number;
  };
  memory: {
    usage: number; // percentage
    total: number; // GB
    available: number;
    utilization: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    bandwidth: number; // Mbps
    utilization: number; // percentage
  };
  disk: {
    usage: number; // percentage
    total: number; // GB
    available: number;
    iops: number;
    throughput: number; // MB/s
  };
  application: {
    requestsPerSecond: number;
    responseTime: number; // ms
    errorRate: number; // percentage
    activeConnections: number;
    queueDepth: number;
  };
  custom: Record<string, number>;
}

interface ScalingEvent {
  id: string;
  timestamp: Date;
  type: 'scale-up' | 'scale-down' | 'scale-out' | 'scale-in' | 'resize';
  resource: string;
  trigger: string;
  policy: string;
  action: {
    type: string;
    from: Record<string, any>;
    to: Record<string, any>;
    reason: string;
  };
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  result?: {
    success: boolean;
    message: string;
    details: Record<string, any>;
  };
  cost?: {
    currency: string;
    amount: number;
    savings?: number;
  };
}

interface ScalingRecommendation {
  id: string;
  resource: string;
  type: 'horizontal' | 'vertical' | 'schedule' | 'cost-optimization';
  priority: 'high' | 'medium' | 'low';
  confidence: number; // percentage
  recommendation: {
    action: string;
    current: Record<string, any>;
    proposed: Record<string, any>;
    reasoning: string;
  };
  impact: {
    performance: number; // percentage improvement
    cost: number; // percentage change
    availability: number; // percentage change
    resourceUtilization: number; // percentage improvement
  };
  implementation: {
    effort: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
    rollbackPlan: string;
    estimatedTime: number; // minutes
  };
  validUntil: Date;
}

interface AutoScalingMetrics {
  timestamp: Date;
  resources: Array<{
    id: string;
    name: string;
    type: string;
    instances: number;
    cpu: number;
    memory: number;
    utilization: number;
    cost: number;
  }>;
  scaling: {
    eventsToday: number;
    eventsThisWeek: number;
    eventsThisMonth: number;
    successRate: number; // percentage
    averageScalingTime: number; // seconds
    costSavings: number;
  };
  efficiency: {
    resourceUtilization: number; // percentage
    wastedCapacity: number; // percentage
    rightSizingOpportunities: number;
    costOptimizationPotential: number; // percentage
  };
  predictions: {
    nextScalingEvent: Date;
    peakCapacityToday: number;
    recommendedCapacity: number;
    costForecast: number;
  };
}

interface ResourceState {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'scaling' | 'failed' | 'maintenance';
  instances: {
    current: number;
    desired: number;
    minimum: number;
    maximum: number;
  };
  capacity: {
    cpu: { current: number; allocated: number; utilization: number };
    memory: { current: number; allocated: number; utilization: number };
    storage: { current: number; allocated: number; utilization: number };
  };
  health: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    score: number; // 0-100
    lastCheck: Date;
  };
  scaling: {
    lastEvent: Date;
    cooldownUntil: Date;
    inProgress: boolean;
    policy: string;
  };
  cost: {
    hourly: number;
    daily: number;
    monthly: number;
    currency: string;
  };
  metadata: {
    region: string;
    zone: string;
    tags: Record<string, string>;
    provider: string;
  };
}

export class AutoScaling {
  private config: AutoScalingConfig;
  private resources: Map<string, ResourceState> = new Map();
  private metrics: Map<string, ResourceMetrics[]> = new Map();
  private events: ScalingEvent[] = [];
  private recommendations: ScalingRecommendation[] = [];
  private policies: Map<string, any> = new Map();
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: AutoScalingConfig) {
    this.config = config;
    this.initializeResources();
    this.initializePolicies();
    this.startMonitoring();
  }

  async scaleResource(
    resourceId: string,
    action: {
      type: 'scale-up' | 'scale-down' | 'scale-out' | 'scale-in' | 'resize';
      target: Record<string, any>;
      reason: string;
      policy?: string;
    }
  ): Promise<ScalingEvent> {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Check if scaling is in cooldown
    if (resource.scaling.cooldownUntil > new Date()) {
      throw new Error(`Resource ${resourceId} is in cooldown period`);
    }

    // Create scaling event
    const event: ScalingEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      type: action.type,
      resource: resourceId,
      trigger: 'manual',
      policy: action.policy || 'manual',
      action: {
        type: action.type,
        from: this.getResourceCurrentState(resource),
        to: action.target,
        reason: action.reason
      },
      status: 'pending',
      startTime: new Date()
    };

    this.events.push(event);

    try {
      // Mark scaling as in progress
      resource.scaling.inProgress = true;
      event.status = 'in-progress';

      // Perform the actual scaling
      const result = await this.executeScaling(resource, action);

      // Update resource state
      await this.updateResourceState(resourceId, action.target);

      // Update event
      event.status = 'completed';
      event.endTime = new Date();
      event.duration = event.endTime.getTime() - event.startTime.getTime();
      event.result = result;

      // Set cooldown period
      const cooldownDuration = this.getCooldownDuration(action.type);
      resource.scaling.cooldownUntil = new Date(Date.now() + cooldownDuration * 1000);
      resource.scaling.lastEvent = new Date();
      resource.scaling.inProgress = false;

      // Send notifications
      if (this.config.notifications.enabled) {
        await this.sendScalingNotification(event);
      }

      return event;

    } catch (error) {
      event.status = 'failed';
      event.endTime = new Date();
      event.result = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { error: error instanceof Error ? error.stack : String(error) }
      };

      resource.scaling.inProgress = false;
      throw error;
    }
  }

  async getResourceMetrics(
    resourceId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    current: ResourceMetrics;
    historical: ResourceMetrics[];
    trends: {
      cpu: 'increasing' | 'decreasing' | 'stable';
      memory: 'increasing' | 'decreasing' | 'stable';
      requests: 'increasing' | 'decreasing' | 'stable';
    };
    predictions: {
      nextHour: ResourceMetrics;
      nextDay: ResourceMetrics;
      peakLoad: { time: Date; metrics: ResourceMetrics };
    };
  }> {
    const metrics = this.metrics.get(resourceId) || [];
    
    let historical = metrics;
    if (timeRange) {
      historical = metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const current = historical[historical.length - 1] || await this.getCurrentMetrics(resourceId);
    const trends = await this.calculateTrends(historical);
    const predictions = await this.generatePredictions(resourceId, historical);

    return { current, historical, trends, predictions };
  }

  async evaluateScaling(): Promise<{
    recommendations: ScalingRecommendation[];
    triggers: Array<{
      resource: string;
      policy: string;
      condition: string;
      action: string;
      urgency: 'low' | 'medium' | 'high';
    }>;
    summary: {
      resourcesNeedingAttention: number;
      potentialCostSavings: number;
      performanceImprovements: number;
      rightsizingOpportunities: number;
    };
  }> {
    const recommendations: ScalingRecommendation[] = [];
    const triggers: any[] = [];

    // Evaluate each resource
    for (const [resourceId, resource] of this.resources.entries()) {
      const metrics = await this.getCurrentMetrics(resourceId);
      
      // Check policy conditions
      for (const [policyId, policy] of this.policies.entries()) {
        if (!policy.enabled) continue;
        
        const evaluation = await this.evaluatePolicy(policy, metrics);
        if (evaluation.shouldTrigger) {
          triggers.push({
            resource: resourceId,
            policy: policyId,
            condition: evaluation.condition,
            action: evaluation.action,
            urgency: evaluation.urgency
          });
        }
      }

      // Generate recommendations
      const resourceRecommendations = await this.generateRecommendations(resourceId, metrics);
      recommendations.push(...resourceRecommendations);
    }

    // Calculate summary
    const summary = {
      resourcesNeedingAttention: triggers.length,
      potentialCostSavings: recommendations.reduce((sum, r) => 
        sum + (r.impact.cost < 0 ? Math.abs(r.impact.cost) : 0), 0),
      performanceImprovements: recommendations.filter(r => r.impact.performance > 0).length,
      rightsizingOpportunities: recommendations.filter(r => r.type === 'cost-optimization').length
    };

    return { recommendations, triggers, summary };
  }

  async applyRecommendation(recommendationId: string): Promise<ScalingEvent> {
    const recommendation = this.recommendations.find(r => r.id === recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    if (recommendation.validUntil < new Date()) {
      throw new Error('Recommendation has expired');
    }

    // Convert recommendation to scaling action
    const action = {
      type: this.mapRecommendationToAction(recommendation),
      target: recommendation.recommendation.proposed,
      reason: recommendation.recommendation.reasoning,
      policy: 'recommendation'
    };

    return await this.scaleResource(recommendation.resource, action);
  }

  async getAutoScalingMetrics(): Promise<AutoScalingMetrics> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const eventsToday = this.events.filter(e => e.timestamp >= today).length;
    const eventsThisWeek = this.events.filter(e => e.timestamp >= thisWeek).length;
    const eventsThisMonth = this.events.filter(e => e.timestamp >= thisMonth).length;

    const completedEvents = this.events.filter(e => e.status === 'completed');
    const successRate = this.events.length > 0 ? 
      (completedEvents.length / this.events.length) * 100 : 100;

    const averageScalingTime = completedEvents.length > 0 ?
      completedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / completedEvents.length / 1000 : 0;

    const resources = Array.from(this.resources.values()).map(resource => ({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      instances: resource.instances.current,
      cpu: resource.capacity.cpu.utilization,
      memory: resource.capacity.memory.utilization,
      utilization: (resource.capacity.cpu.utilization + resource.capacity.memory.utilization) / 2,
      cost: resource.cost.hourly
    }));

    const totalUtilization = resources.length > 0 ?
      resources.reduce((sum, r) => sum + r.utilization, 0) / resources.length : 0;

    return {
      timestamp: now,
      resources,
      scaling: {
        eventsToday,
        eventsThisWeek,
        eventsThisMonth,
        successRate,
        averageScalingTime,
        costSavings: await this.calculateCostSavings()
      },
      efficiency: {
        resourceUtilization: totalUtilization,
        wastedCapacity: Math.max(0, 100 - totalUtilization),
        rightSizingOpportunities: this.recommendations.filter(r => r.type === 'cost-optimization').length,
        costOptimizationPotential: await this.calculateCostOptimizationPotential()
      },
      predictions: {
        nextScalingEvent: await this.predictNextScalingEvent(),
        peakCapacityToday: await this.predictPeakCapacity(),
        recommendedCapacity: await this.calculateRecommendedCapacity(),
        costForecast: await this.forecastCost()
      }
    };
  }

  async optimizeResources(): Promise<{
    applied: ScalingEvent[];
    recommendations: ScalingRecommendation[];
    savings: {
      cost: number;
      performance: number;
      efficiency: number;
    };
  }> {
    const evaluation = await this.evaluateScaling();
    const applied: ScalingEvent[] = [];

    // Auto-apply low-risk, high-impact recommendations
    const autoApplicable = evaluation.recommendations.filter(r => 
      r.implementation.riskLevel === 'low' && 
      r.priority === 'high' &&
      r.confidence > 80
    );

    for (const recommendation of autoApplicable) {
      try {
        const event = await this.applyRecommendation(recommendation.id);
        applied.push(event);
      } catch (error) {
        console.error(`Failed to apply recommendation ${recommendation.id}:`, error);
      }
    }

    // Calculate savings
    const savings = {
      cost: applied.reduce((sum, e) => sum + (e.cost?.savings || 0), 0),
      performance: applied.reduce((sum, e) => sum + 5, 0), // Mock 5% per optimization
      efficiency: applied.length * 10 // Mock 10% per optimization
    };

    return {
      applied,
      recommendations: evaluation.recommendations.filter(r => 
        !autoApplicable.includes(r)
      ),
      savings
    };
  }

  async addResource(resource: AutoScalingConfig['resources'][0]): Promise<void> {
    // Add to config
    this.config.resources.push(resource);
    
    // Initialize resource state
    const state: ResourceState = {
      id: resource.identifier,
      name: resource.name,
      type: resource.type,
      status: 'running',
      instances: {
        current: 1,
        desired: 1,
        minimum: this.config.scaling.horizontal.minInstances,
        maximum: this.config.scaling.horizontal.maxInstances
      },
      capacity: {
        cpu: { current: 2, allocated: 4, utilization: 50 },
        memory: { current: 4, allocated: 8, utilization: 50 },
        storage: { current: 20, allocated: 50, utilization: 40 }
      },
      health: {
        status: 'healthy',
        score: 95,
        lastCheck: new Date()
      },
      scaling: {
        lastEvent: new Date(0),
        cooldownUntil: new Date(0),
        inProgress: false,
        policy: 'default'
      },
      cost: {
        hourly: 0.10,
        daily: 2.40,
        monthly: 73.00,
        currency: 'USD'
      },
      metadata: {
        region: resource.region || 'us-east-1',
        zone: resource.zone || 'us-east-1a',
        tags: {},
        provider: this.config.provider
      }
    };

    this.resources.set(resource.identifier, state);
    this.metrics.set(resource.identifier, []);
  }

  async removeResource(resourceId: string): Promise<void> {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Check if scaling is in progress
    if (resource.scaling.inProgress) {
      throw new Error(`Cannot remove resource ${resourceId} while scaling is in progress`);
    }

    // Remove from config
    this.config.resources = this.config.resources.filter(r => r.identifier !== resourceId);
    
    // Remove from runtime data
    this.resources.delete(resourceId);
    this.metrics.delete(resourceId);
  }

  async pauseAutoScaling(resourceId?: string): Promise<void> {
    if (resourceId) {
      const resource = this.resources.get(resourceId);
      if (resource) {
        resource.status = 'maintenance';
      }
    } else {
      // Pause all auto scaling
      for (const resource of this.resources.values()) {
        resource.status = 'maintenance';
      }
      this.isMonitoring = false;
    }
  }

  async resumeAutoScaling(resourceId?: string): Promise<void> {
    if (resourceId) {
      const resource = this.resources.get(resourceId);
      if (resource) {
        resource.status = 'running';
      }
    } else {
      // Resume all auto scaling
      for (const resource of this.resources.values()) {
        resource.status = 'running';
      }
      this.isMonitoring = true;
    }
  }

  private initializeResources(): void {
    for (const resource of this.config.resources) {
      const state: ResourceState = {
        id: resource.identifier,
        name: resource.name,
        type: resource.type,
        status: 'running',
        instances: {
          current: 1,
          desired: 1,
          minimum: this.config.scaling.horizontal.minInstances,
          maximum: this.config.scaling.horizontal.maxInstances
        },
        capacity: {
          cpu: { current: 2, allocated: 4, utilization: 50 },
          memory: { current: 4, allocated: 8, utilization: 50 },
          storage: { current: 20, allocated: 50, utilization: 40 }
        },
        health: {
          status: 'healthy',
          score: 95,
          lastCheck: new Date()
        },
        scaling: {
          lastEvent: new Date(0),
          cooldownUntil: new Date(0),
          inProgress: false,
          policy: 'default'
        },
        cost: {
          hourly: 0.10,
          daily: 2.40,
          monthly: 73.00,
          currency: 'USD'
        },
        metadata: {
          region: resource.region || 'us-east-1',
          zone: resource.zone || 'us-east-1a',
          tags: {},
          provider: this.config.provider
        }
      };

      this.resources.set(resource.identifier, state);
      this.metrics.set(resource.identifier, []);
    }
  }

  private initializePolicies(): void {
    for (const policy of this.config.policies) {
      this.policies.set(policy.id, policy);
    }
  }

  private startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    this.monitoringInterval = setInterval(async () => {
      try {
        // Collect metrics for all resources
        for (const resourceId of this.resources.keys()) {
          const metrics = await this.getCurrentMetrics(resourceId);
          const resourceMetrics = this.metrics.get(resourceId) || [];
          resourceMetrics.push(metrics);
          
          // Keep only last 1000 metrics
          if (resourceMetrics.length > 1000) {
            resourceMetrics.splice(0, resourceMetrics.length - 1000);
          }
          
          this.metrics.set(resourceId, resourceMetrics);
        }

        // Evaluate scaling conditions
        const evaluation = await this.evaluateScaling();
        
        // Auto-trigger scaling based on policies
        for (const trigger of evaluation.triggers) {
          if (trigger.urgency === 'high') {
            await this.autoTriggerScaling(trigger);
          }
        }

        // Update recommendations
        this.recommendations = evaluation.recommendations;

      } catch (error) {
        console.error('Error in auto-scaling monitoring:', error);
      }
    }, this.config.metrics.collection.interval * 1000);
  }

  private async getCurrentMetrics(resourceId: string): Promise<ResourceMetrics> {
    // Mock metrics generation
    const resource = this.resources.get(resourceId);
    const baseUtilization = resource ? resource.capacity.cpu.utilization : 50;
    
    // Add some randomness to simulate real metrics
    const cpuUsage = Math.max(0, Math.min(100, baseUtilization + (Math.random() - 0.5) * 20));
    const memoryUsage = Math.max(0, Math.min(100, baseUtilization + (Math.random() - 0.5) * 15));
    
    return {
      resourceId,
      timestamp: new Date(),
      cpu: {
        usage: cpuUsage,
        cores: resource?.capacity.cpu.allocated || 4,
        utilization: cpuUsage
      },
      memory: {
        usage: memoryUsage,
        total: resource?.capacity.memory.allocated || 8,
        available: (100 - memoryUsage) / 100 * (resource?.capacity.memory.allocated || 8),
        utilization: memoryUsage
      },
      network: {
        bytesIn: Math.random() * 1024 * 1024 * 100, // 0-100MB
        bytesOut: Math.random() * 1024 * 1024 * 50,  // 0-50MB
        packetsIn: Math.random() * 10000,
        packetsOut: Math.random() * 8000,
        bandwidth: 1000, // 1Gbps
        utilization: Math.random() * 60 // 0-60%
      },
      disk: {
        usage: 30 + Math.random() * 40, // 30-70%
        total: resource?.capacity.storage.allocated || 50,
        available: (70 - Math.random() * 40) / 100 * (resource?.capacity.storage.allocated || 50),
        iops: Math.random() * 1000,
        throughput: Math.random() * 100 // MB/s
      },
      application: {
        requestsPerSecond: Math.random() * 1000,
        responseTime: 50 + Math.random() * 200, // 50-250ms
        errorRate: Math.random() * 5, // 0-5%
        activeConnections: Math.floor(Math.random() * 500),
        queueDepth: Math.floor(Math.random() * 100)
      },
      custom: {}
    };
  }

  private async executeScaling(resource: ResourceState, action: any): Promise<any> {
    // Mock scaling execution
    console.log(`Executing ${action.type} for resource ${resource.id}`);
    
    // Simulate scaling delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      message: `Successfully executed ${action.type}`,
      details: {
        provider: this.config.provider,
        resourceId: resource.id,
        action: action.type
      }
    };
  }

  private async updateResourceState(resourceId: string, target: Record<string, any>): Promise<void> {
    const resource = this.resources.get(resourceId);
    if (!resource) return;

    // Update resource state based on target
    if (target.instances) {
      resource.instances.current = target.instances;
      resource.instances.desired = target.instances;
    }
    
    if (target.cpu) {
      resource.capacity.cpu.allocated = target.cpu;
    }
    
    if (target.memory) {
      resource.capacity.memory.allocated = target.memory;
    }
  }

  private getResourceCurrentState(resource: ResourceState): Record<string, any> {
    return {
      instances: resource.instances.current,
      cpu: resource.capacity.cpu.allocated,
      memory: resource.capacity.memory.allocated,
      storage: resource.capacity.storage.allocated
    };
  }

  private getCooldownDuration(actionType: string): number {
    switch (actionType) {
      case 'scale-up':
      case 'scale-out':
        return this.config.scaling.horizontal.scaleUpCooldown;
      case 'scale-down':
      case 'scale-in':
        return this.config.scaling.horizontal.scaleDownCooldown;
      default:
        return 300; // 5 minutes default
    }
  }

  private async evaluatePolicy(policy: any, metrics: ResourceMetrics): Promise<any> {
    // Mock policy evaluation
    const cpuThreshold = this.config.metrics.thresholds.cpu.scaleUp;
    const shouldTrigger = metrics.cpu.utilization > cpuThreshold;
    
    return {
      shouldTrigger,
      condition: `CPU utilization ${metrics.cpu.utilization}% > ${cpuThreshold}%`,
      action: 'scale-up',
      urgency: metrics.cpu.utilization > 90 ? 'high' : 'medium'
    };
  }

  private async generateRecommendations(resourceId: string, metrics: ResourceMetrics): Promise<ScalingRecommendation[]> {
    const recommendations: ScalingRecommendation[] = [];
    const resource = this.resources.get(resourceId);
    if (!resource) return recommendations;

    // Example recommendation for underutilized resources
    if (metrics.cpu.utilization < 30 && metrics.memory.utilization < 30) {
      recommendations.push({
        id: this.generateRecommendationId(),
        resource: resourceId,
        type: 'cost-optimization',
        priority: 'medium',
        confidence: 85,
        recommendation: {
          action: 'Scale down resource to reduce costs',
          current: { instances: resource.instances.current },
          proposed: { instances: Math.max(1, resource.instances.current - 1) },
          reasoning: 'Resource is consistently underutilized'
        },
        impact: {
          performance: -5,
          cost: -25,
          availability: 0,
          resourceUtilization: 15
        },
        implementation: {
          effort: 'low',
          riskLevel: 'low',
          rollbackPlan: 'Scale back up if performance degrades',
          estimatedTime: 5
        },
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });
    }

    return recommendations;
  }

  private mapRecommendationToAction(recommendation: ScalingRecommendation): any {
    // Map recommendation to scaling action
    if (recommendation.recommendation.action.includes('Scale down')) {
      return 'scale-down';
    } else if (recommendation.recommendation.action.includes('Scale up')) {
      return 'scale-up';
    }
    return 'resize';
  }

  private async calculateTrends(metrics: ResourceMetrics[]): Promise<any> {
    // Mock trend calculation
    return {
      cpu: 'stable',
      memory: 'increasing',
      requests: 'stable'
    };
  }

  private async generatePredictions(resourceId: string, historical: ResourceMetrics[]): Promise<any> {
    // Mock predictions
    const latest = historical[historical.length - 1];
    if (!latest) return null;

    return {
      nextHour: {
        ...latest,
        timestamp: new Date(Date.now() + 60 * 60 * 1000),
        cpu: { ...latest.cpu, utilization: latest.cpu.utilization + 5 }
      },
      nextDay: {
        ...latest,
        timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000),
        cpu: { ...latest.cpu, utilization: latest.cpu.utilization + 10 }
      },
      peakLoad: {
        time: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        metrics: {
          ...latest,
          cpu: { ...latest.cpu, utilization: 85 },
          memory: { ...latest.memory, utilization: 80 }
        }
      }
    };
  }

  private async autoTriggerScaling(trigger: any): Promise<void> {
    try {
      const action = {
        type: trigger.action,
        target: { instances: 1 }, // Simplified
        reason: `Auto-triggered by policy ${trigger.policy}: ${trigger.condition}`,
        policy: trigger.policy
      };

      await this.scaleResource(trigger.resource, action);
    } catch (error) {
      console.error(`Failed to auto-trigger scaling for ${trigger.resource}:`, error);
    }
  }

  private async sendScalingNotification(event: ScalingEvent): Promise<void> {
    // Mock notification sending
    console.log(`Sending scaling notification for ${event.resource}: ${event.action.reason}`);
  }

  private async calculateCostSavings(): Promise<number> {
    // Mock cost savings calculation
    return 150.50; // $150.50 saved this month
  }

  private async calculateCostOptimizationPotential(): Promise<number> {
    // Mock cost optimization potential
    return 25; // 25% potential savings
  }

  private async predictNextScalingEvent(): Promise<Date> {
    // Mock prediction
    return new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
  }

  private async predictPeakCapacity(): Promise<number> {
    // Mock peak capacity prediction
    return 85; // 85% utilization
  }

  private async calculateRecommendedCapacity(): Promise<number> {
    // Mock recommended capacity
    return 70; // 70% utilization target
  }

  private async forecastCost(): Promise<number> {
    // Mock cost forecast
    return 2500; // $2500 for next month
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export {
  type AutoScalingConfig,
  type ResourceMetrics,
  type ScalingEvent,
  type ScalingRecommendation,
  type AutoScalingMetrics,
  type ResourceState
};