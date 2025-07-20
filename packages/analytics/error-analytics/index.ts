interface ErrorEvent {
  id: string;
  timestamp: Date;
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  category: 'system' | 'user' | 'ai' | 'build' | 'runtime' | 'network' | 'security';
  source: {
    component: string;
    function?: string;
    file?: string;
    line?: number;
    column?: number;
  };
  error: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
    type: 'syntax' | 'runtime' | 'logic' | 'network' | 'validation' | 'permission' | 'timeout';
  };
  context: {
    userId?: string;
    sessionId?: string;
    projectId?: string;
    environment: 'development' | 'staging' | 'production';
    version: string;
    platform: string;
    browser?: string;
    os?: string;
    userAgent?: string;
  };
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: any;
    params?: Record<string, any>;
    query?: Record<string, any>;
  };
  performance: {
    memory?: number;
    cpu?: number;
    responseTime?: number;
    timestamp: number;
  };
  metadata: {
    fingerprint: string; // For grouping similar errors
    tags: string[];
    customData: Record<string, any>;
    breadcrumbs: Breadcrumb[];
  };
  resolution?: {
    status: 'open' | 'acknowledged' | 'resolved' | 'ignored';
    assignedTo?: string;
    resolvedAt?: Date;
    resolution?: string;
    preventionMeasures?: string[];
  };
}

interface Breadcrumb {
  timestamp: Date;
  category: 'navigation' | 'http' | 'user' | 'system' | 'ai';
  message: string;
  data?: Record<string, any>;
  level: 'debug' | 'info' | 'warning' | 'error';
}

interface ErrorPattern {
  id: string;
  fingerprint: string;
  name: string;
  description: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  affectedUsers: number;
  affectedSessions: number;
  frequency: {
    hourly: number[];
    daily: number[];
    weekly: number[];
  };
  environments: Record<string, number>;
  platforms: Record<string, number>;
  severity: ErrorEvent['severity'];
  category: ErrorEvent['category'];
  trend: 'increasing' | 'decreasing' | 'stable';
  impact: {
    userExperience: number; // 0-100
    systemStability: number;
    businessCritical: boolean;
    affectedFeatures: string[];
  };
  rootCause?: {
    identified: boolean;
    category: 'code' | 'infrastructure' | 'external' | 'configuration' | 'data';
    description?: string;
    component?: string;
    solution?: string;
  };
  similarPatterns: string[]; // IDs of similar error patterns
}

interface ErrorAlert {
  id: string;
  patternId: string;
  type: 'threshold' | 'spike' | 'new_error' | 'critical_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  threshold?: {
    metric: 'count' | 'rate' | 'unique_users' | 'response_time';
    value: number;
    timeWindow: number; // minutes
  };
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  actions: AlertAction[];
  notificationChannels: string[];
}

interface AlertAction {
  type: 'notify' | 'escalate' | 'auto_fix' | 'rollback' | 'scale';
  target: string;
  executed: boolean;
  executedAt?: Date;
  result?: string;
}

interface ErrorReport {
  id: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalErrors: number;
    uniqueErrors: number;
    affectedUsers: number;
    errorRate: number;
    criticalErrors: number;
    resolvedErrors: number;
    meanTimeToResolution: number;
  };
  patterns: {
    topErrors: ErrorPattern[];
    newErrors: ErrorPattern[];
    trendingErrors: ErrorPattern[];
    resolvedErrors: ErrorPattern[];
  };
  insights: {
    errorHotspots: Array<{
      component: string;
      errorCount: number;
      severity: string;
    }>;
    timePatterns: Array<{
      hour: number;
      errorCount: number;
      severity: string;
    }>;
    userImpact: Array<{
      userId: string;
      errorCount: number;
      affectedFeatures: string[];
    }>;
    platformDistribution: Record<string, number>;
  };
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: 'fix' | 'monitoring' | 'prevention';
    title: string;
    description: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }>;
}

interface ErrorMetrics {
  period: 'hour' | 'day' | 'week' | 'month';
  data: Array<{
    timestamp: Date;
    totalErrors: number;
    uniqueErrors: number;
    affectedUsers: number;
    errorRate: number;
    severityBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    responseTime: number;
    availability: number;
  }>;
  aggregated: {
    average: number;
    peak: number;
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
  };
}

interface AIErrorAnalysis {
  id: string;
  errorId: string;
  analysis: {
    rootCauseHypotheses: Array<{
      hypothesis: string;
      confidence: number;
      evidence: string[];
      category: 'code' | 'data' | 'infrastructure' | 'external';
    }>;
    similarErrors: Array<{
      errorId: string;
      similarity: number;
      resolution?: string;
    }>;
    impact: {
      severity: number; // 0-100
      scope: 'local' | 'feature' | 'system' | 'critical';
      affectedFeatures: string[];
      estimatedDowntime: number; // minutes
    };
    solutions: Array<{
      solution: string;
      confidence: number;
      complexity: 'low' | 'medium' | 'high';
      estimatedTime: number; // hours
      preventionMeasures: string[];
    }>;
  };
  generatedAt: Date;
  feedback?: {
    helpful: boolean;
    accuracy: number; // 0-100
    comments?: string;
  };
}

export class ErrorAnalyticsEngine {
  private errors: Map<string, ErrorEvent> = new Map();
  private patterns: Map<string, ErrorPattern> = new Map();
  private alerts: Map<string, ErrorAlert> = new Map();
  private reports: Map<string, ErrorReport> = new Map();
  private aiAnalyzer: AIErrorAnalyzer;
  private patternDetector: ErrorPatternDetector;
  private alertManager: ErrorAlertManager;
  private fingerprinter: ErrorFingerprinter;

  constructor() {
    this.aiAnalyzer = new AIErrorAnalyzer();
    this.patternDetector = new ErrorPatternDetector();
    this.alertManager = new ErrorAlertManager();
    this.fingerprinter = new ErrorFingerprinter();
    
    this.startProcessing();
  }

  captureError(errorData: Omit<ErrorEvent, 'id' | 'timestamp' | 'metadata'> & { additionalData?: Record<string, any> }): ErrorEvent {
    const { additionalData, ...rest } = errorData;
    const error: ErrorEvent = {
      ...rest,
      id: this.generateErrorId(),
      timestamp: new Date(),
      metadata: {
        fingerprint: this.fingerprinter.generate(rest),
        tags: this.extractTags(rest),
        customData: additionalData || {},
        breadcrumbs: []
      }
    };

    this.errors.set(error.id, error);
    
    // Process error immediately for critical issues
    this.processErrorImmediate(error);
    
    return error;
  }

  captureException(exception: Error, context: Partial<ErrorEvent['context']>, additionalData?: Record<string, any>): ErrorEvent {
    const errorEvent: Omit<ErrorEvent, 'id' | 'timestamp' | 'metadata'> = {
      severity: 'error',
      category: 'runtime',
      source: {
        component: 'unknown',
        function: this.extractFunctionName(exception.stack),
        file: this.extractFileName(exception.stack),
        line: this.extractLineNumber(exception.stack)
      },
      error: {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
        type: this.classifyError(exception)
      },
      context: {
        environment: 'production',
        version: '1.0.0',
        platform: 'web',
        ...context
      },
      performance: {
        timestamp: Date.now()
      }
    };
    // Pass additionalData to captureError for inclusion in metadata
    return this.captureError({ ...errorEvent, ...{ additionalData } });
    return this.captureError(errorEvent);
  }

  addBreadcrumb(sessionId: string, breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    // Find all errors in the session and add breadcrumb
    const sessionErrors = Array.from(this.errors.values())
      .filter(error => error.context.sessionId === sessionId);

    const fullBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      timestamp: new Date()
    };

    sessionErrors.forEach(error => {
      error.metadata.breadcrumbs.push(fullBreadcrumb);
      
      // Keep only last 20 breadcrumbs
      if (error.metadata.breadcrumbs.length > 20) {
        error.metadata.breadcrumbs = error.metadata.breadcrumbs.slice(-20);
      }
    });
  }

  async getErrorPattern(fingerprint: string): Promise<ErrorPattern | null> {
    return this.patterns.get(fingerprint) || null;
  }

  async getErrorPatterns(options: {
    severity?: ErrorEvent['severity'][];
    category?: ErrorEvent['category'][];
    environment?: string[];
    timeRange?: { start: Date; end: Date };
    limit?: number;
    sortBy?: 'occurrences' | 'lastSeen' | 'affectedUsers' | 'severity';
  }): Promise<ErrorPattern[]> {
    let patterns = Array.from(this.patterns.values());

    // Apply filters
    if (options.severity) {
      patterns = patterns.filter(p => options.severity!.includes(p.severity));
    }

    if (options.category) {
      patterns = patterns.filter(p => options.category!.includes(p.category));
    }

    if (options.timeRange) {
      patterns = patterns.filter(p => 
        p.lastSeen >= options.timeRange!.start && 
        p.lastSeen <= options.timeRange!.end
      );
    }

    // Sort patterns
    const sortBy = options.sortBy || 'occurrences';
    patterns.sort((a, b) => {
      switch (sortBy) {
        case 'occurrences':
          return b.occurrences - a.occurrences;
        case 'lastSeen':
          return b.lastSeen.getTime() - a.lastSeen.getTime();
        case 'affectedUsers':
          return b.affectedUsers - a.affectedUsers;
        case 'severity':
          const severityOrder = { critical: 5, error: 4, warning: 3, info: 2, debug: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        default:
          return 0;
      }
    });

    return patterns.slice(0, options.limit || 50);
  }

  async analyzeErrorWithAI(errorId: string): Promise<AIErrorAnalysis> {
    const error = this.errors.get(errorId);
    if (!error) {
      throw new Error(`Error ${errorId} not found`);
    }

    return await this.aiAnalyzer.analyze(error, {
      similarErrors: this.findSimilarErrors(error),
      historicalData: this.getHistoricalData(error),
      contextData: this.getContextData(error)
    });
  }

  async getErrorMetrics(options: {
    period: ErrorMetrics['period'];
    timeRange: { start: Date; end: Date };
    groupBy?: 'severity' | 'category' | 'component';
  }): Promise<ErrorMetrics> {
    const errors = this.getErrorsInTimeRange(options.timeRange);
    
    const metrics = this.calculateErrorMetrics(errors, options);
    
    return metrics;
  }

  async generateErrorReport(options: {
    period: { start: Date; end: Date };
    includeResolved?: boolean;
    format?: 'summary' | 'detailed' | 'executive';
  }): Promise<ErrorReport> {
    const errors = this.getErrorsInTimeRange(options.period);
    const patterns = this.getPatternsInTimeRange(options.period);

    const report: ErrorReport = {
      id: this.generateReportId(),
      period: options.period,
      summary: this.calculateErrorSummary(errors, patterns),
      patterns: {
        topErrors: patterns.slice(0, 10),
        newErrors: patterns.filter(p => p.firstSeen >= options.period.start).slice(0, 5),
        trendingErrors: patterns.filter(p => p.trend === 'increasing').slice(0, 5),
        resolvedErrors: options.includeResolved ? 
          patterns.filter(p => p.rootCause?.identified).slice(0, 5) : []
      },
      insights: this.generateErrorInsights(errors, patterns),
      recommendations: this.generateErrorRecommendations(errors, patterns)
    };

    this.reports.set(report.id, report);
    return report;
  }

  async createAlert(alertData: Omit<ErrorAlert, 'id' | 'triggeredAt' | 'acknowledged' | 'resolved'>): Promise<ErrorAlert> {
    const alert: ErrorAlert = {
      ...alertData,
      id: this.generateAlertId(),
      triggeredAt: new Date(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.set(alert.id, alert);
    
    // Execute alert actions
    await this.alertManager.processAlert(alert);

    return alert;
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();
    }
  }

  async resolveError(errorId: string, resolution: {
    status: 'resolved' | 'ignored';
    assignedTo?: string;
    resolution?: string;
    preventionMeasures?: string[];
  }): Promise<void> {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolution = {
        ...resolution,
        resolvedAt: new Date()
      };

      // Update pattern if this was the last occurrence
      const pattern = this.patterns.get(error.metadata.fingerprint);
      if (pattern) {
        this.updatePatternResolution(pattern, resolution);
      }
    }
  }

  async searchErrors(query: {
    text?: string;
    filters?: {
      severity?: string[];
      category?: string[];
      component?: string[];
      timeRange?: { start: Date; end: Date };
    };
    limit?: number;
  }): Promise<ErrorEvent[]> {
    let errors = Array.from(this.errors.values());

    // Apply filters
    if (query.filters) {
      if (query.filters.severity) {
        errors = errors.filter(e => query.filters!.severity!.includes(e.severity));
      }
      if (query.filters.category) {
        errors = errors.filter(e => query.filters!.category!.includes(e.category));
      }
      if (query.filters.component) {
        errors = errors.filter(e => query.filters!.component!.includes(e.source.component));
      }
      if (query.filters.timeRange) {
        errors = errors.filter(e => 
          e.timestamp >= query.filters!.timeRange!.start && 
          e.timestamp <= query.filters!.timeRange!.end
        );
      }
    }

    // Text search
    if (query.text) {
      const searchText = query.text.toLowerCase();
      errors = errors.filter(e => 
        e.error.message.toLowerCase().includes(searchText) ||
        e.error.name.toLowerCase().includes(searchText) ||
        e.source.component.toLowerCase().includes(searchText)
      );
    }

    // Sort by timestamp (newest first)
    errors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return errors.slice(0, query.limit || 100);
  }

  async getErrorTrends(options: {
    timeRange: { start: Date; end: Date };
    granularity: 'hour' | 'day' | 'week';
    metrics: ('count' | 'unique_errors' | 'affected_users' | 'error_rate')[];
  }): Promise<Array<{
    timestamp: Date;
    metrics: Record<string, number>;
  }>> {
    const errors = this.getErrorsInTimeRange(options.timeRange);
    
    return this.calculateTrends(errors, options);
  }

  private processErrorImmediate(error: ErrorEvent): void {
    // Update or create pattern
    this.updateErrorPattern(error);
    
    // Check for alerts
    this.checkAlertConditions(error);
    
    // Trigger AI analysis for critical errors
    if (error.severity === 'critical' || error.severity === 'error') {
      this.scheduleAIAnalysis(error);
    }
  }

  private updateErrorPattern(error: ErrorEvent): void {
    const fingerprint = error.metadata.fingerprint;
    let pattern = this.patterns.get(fingerprint);

    if (!pattern) {
      pattern = {
        id: this.generatePatternId(),
        fingerprint,
        name: this.generatePatternName(error),
        description: error.error.message,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        occurrences: 1,
        affectedUsers: error.context.userId ? 1 : 0,
        affectedSessions: error.context.sessionId ? 1 : 0,
        frequency: { hourly: [], daily: [], weekly: [] },
        environments: { [error.context.environment]: 1 },
        platforms: { [error.context.platform]: 1 },
        severity: error.severity,
        category: error.category,
        trend: 'stable',
        impact: {
          userExperience: this.calculateUserExperienceImpact(error),
          systemStability: this.calculateSystemStabilityImpact(error),
          businessCritical: this.isBusinessCritical(error),
          affectedFeatures: this.extractAffectedFeatures(error)
        },
        similarPatterns: []
      };
      
      this.patterns.set(fingerprint, pattern);
    } else {
      // Update existing pattern
      pattern.lastSeen = error.timestamp;
      pattern.occurrences++;
      
      if (error.context.userId) {
        pattern.affectedUsers++; // Simplified - should track unique users
      }
      if (error.context.sessionId) {
        pattern.affectedSessions++; // Simplified - should track unique sessions
      }
      
      // Update environment and platform counts
      pattern.environments[error.context.environment] = 
        (pattern.environments[error.context.environment] || 0) + 1;
      pattern.platforms[error.context.platform] = 
        (pattern.platforms[error.context.platform] || 0) + 1;
      
      // Update severity if this error is more severe
      if (this.getSeverityLevel(error.severity) > this.getSeverityLevel(pattern.severity)) {
        pattern.severity = error.severity;
      }
      
      // Update trend
      pattern.trend = this.calculatePatternTrend(pattern);
    }
  }

  private checkAlertConditions(error: ErrorEvent): void {
    // Check if error matches any alert conditions
    const relevantAlerts = Array.from(this.alerts.values())
      .filter(alert => !alert.resolved && !alert.acknowledged);

    relevantAlerts.forEach(alert => {
      if (this.shouldTriggerAlert(error, alert)) {
        this.alertManager.triggerAlert(alert, error);
      }
    });

    // Check for automatic alert conditions
    this.checkAutomaticAlerts(error);
  }

  private checkAutomaticAlerts(error: ErrorEvent): void {
    // Critical error alert
    if (error.severity === 'critical') {
      this.createAlert({
        patternId: error.metadata.fingerprint,
        type: 'critical_error',
        severity: 'critical',
        title: 'Critical Error Detected',
        description: `Critical error in ${error.source.component}: ${error.error.message}`,
        actions: [
          { type: 'notify', target: 'on-call-team', executed: false },
          { type: 'escalate', target: 'engineering-lead', executed: false }
        ],
        notificationChannels: ['slack', 'email', 'sms']
      });
    }

    // Error spike detection
    const pattern = this.patterns.get(error.metadata.fingerprint);
    if (pattern && this.isErrorSpike(pattern)) {
      this.createAlert({
        patternId: pattern.id,
        type: 'spike',
        severity: 'high',
        title: 'Error Spike Detected',
        description: `Spike in ${pattern.name} - ${pattern.occurrences} occurrences`,
        threshold: {
          metric: 'count',
          value: 10,
          timeWindow: 5
        },
        actions: [
          { type: 'notify', target: 'development-team', executed: false }
        ],
        notificationChannels: ['slack']
      });
    }
  }

  private scheduleAIAnalysis(error: ErrorEvent): void {
    // Schedule AI analysis for the error
    setTimeout(async () => {
      try {
        await this.analyzeErrorWithAI(error.id);
      } catch (err) {
        console.error('Failed to analyze error with AI:', err);
      }
    }, 1000); // Delay to allow for pattern updates
  }

  private extractTags(errorData: Partial<ErrorEvent>): string[] {
    const tags: string[] = [];
    
    if (errorData.severity) tags.push(`severity:${errorData.severity}`);
    if (errorData.category) tags.push(`category:${errorData.category}`);
    if (errorData.context?.environment) tags.push(`env:${errorData.context.environment}`);
    if (errorData.context?.platform) tags.push(`platform:${errorData.context.platform}`);
    if (errorData.source?.component) tags.push(`component:${errorData.source.component}`);
    
    return tags;
  }

  private extractFunctionName(stack?: string): string | undefined {
    if (!stack) return undefined;
    const match = stack.match(/at\s+(\w+)/);
    return match ? match[1] : undefined;
  }

  private extractFileName(stack?: string): string | undefined {
    if (!stack) return undefined;
    const match = stack.match(/at\s+.*\((.+?):\d+:\d+\)/);
    return match ? match[1] : undefined;
  }

  private extractLineNumber(stack?: string): number | undefined {
    if (!stack) return undefined;
    const match = stack.match(/:(\d+):\d+\)/);
    return match ? parseInt(match[1]) : undefined;
  }

  private classifyError(exception: Error): ErrorEvent['error']['type'] {
    if (exception.name === 'SyntaxError') return 'syntax';
    if (exception.name === 'TypeError') return 'runtime';
    if (exception.name === 'ReferenceError') return 'runtime';
    if (exception.name === 'NetworkError') return 'network';
    if (exception.name === 'ValidationError') return 'validation';
    if (exception.name === 'PermissionError') return 'permission';
    if (exception.name === 'TimeoutError') return 'timeout';
    return 'runtime';
  }

  private findSimilarErrors(error: ErrorEvent): ErrorEvent[] {
    return Array.from(this.errors.values())
      .filter(e => e.id !== error.id && this.calculateErrorSimilarity(error, e) > 0.7)
      .slice(0, 5);
  }

  private calculateErrorSimilarity(error1: ErrorEvent, error2: ErrorEvent): number {
    let similarity = 0;
    
    // Component similarity
    if (error1.source.component === error2.source.component) similarity += 0.3;
    
    // Error type similarity
    if (error1.error.type === error2.error.type) similarity += 0.2;
    
    // Message similarity
    const messageSimilarity = this.calculateTextSimilarity(error1.error.message, error2.error.message);
    similarity += messageSimilarity * 0.3;
    
    // Stack trace similarity
    if (error1.error.stack && error2.error.stack) {
      const stackSimilarity = this.calculateTextSimilarity(error1.error.stack, error2.error.stack);
      similarity += stackSimilarity * 0.2;
    }
    
    return similarity;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation - in production, use more sophisticated algorithms
    const words1 = new Set(text1.toLowerCase().split(/\W+/));
    const words2 = new Set(text2.toLowerCase().split(/\W+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private getHistoricalData(error: ErrorEvent): any {
    // Get historical data for similar errors
    return {};
  }

  private getContextData(error: ErrorEvent): any {
    // Get additional context data
    return {};
  }

  private getErrorsInTimeRange(timeRange: { start: Date; end: Date }): ErrorEvent[] {
    return Array.from(this.errors.values())
      .filter(error => error.timestamp >= timeRange.start && error.timestamp <= timeRange.end);
  }

  private getPatternsInTimeRange(timeRange: { start: Date; end: Date }): ErrorPattern[] {
    return Array.from(this.patterns.values())
      .filter(pattern => pattern.lastSeen >= timeRange.start && pattern.lastSeen <= timeRange.end);
  }

  private calculateErrorMetrics(errors: ErrorEvent[], options: any): ErrorMetrics {
    // Calculate comprehensive error metrics
    const data: ErrorMetrics['data'] = [];
    
    // Group errors by time period
    const groupedErrors = this.groupErrorsByTime(errors, options.period);
    
    for (const [timestamp, groupErrors] of groupedErrors.entries()) {
      const uniqueErrors = new Set(groupErrors.map(e => e.metadata.fingerprint)).size;
      const affectedUsers = new Set(groupErrors.map(e => e.context.userId).filter(Boolean)).size;
      const totalRequests = this.getTotalRequests(new Date(timestamp), options.period);
      const errorRate = totalRequests > 0 ? (groupErrors.length / totalRequests) * 100 : 0;
      
      const severityBreakdown: Record<string, number> = {};
      const categoryBreakdown: Record<string, number> = {};
      
      groupErrors.forEach(error => {
        severityBreakdown[error.severity] = (severityBreakdown[error.severity] || 0) + 1;
        categoryBreakdown[error.category] = (categoryBreakdown[error.category] || 0) + 1;
      });
      
      data.push({
        timestamp: new Date(timestamp),
        totalErrors: groupErrors.length,
        uniqueErrors,
        affectedUsers,
        errorRate,
        severityBreakdown,
        categoryBreakdown,
        responseTime: this.calculateAverageResponseTime(groupErrors),
        availability: this.calculateAvailability(timestamp, options.period)
      });
    }
    
    // Calculate aggregated metrics
    const totalCounts = data.map(d => d.totalErrors);
    const aggregated = {
      average: totalCounts.reduce((sum, count) => sum + count, 0) / Math.max(1, totalCounts.length),
      peak: Math.max(...totalCounts),
      trend: this.calculateTrend(totalCounts),
      changePercent: this.calculateChangePercent(totalCounts)
    };
    
    return {
      period: options.period,
      data,
      aggregated
    };
  }

  private calculateErrorSummary(errors: ErrorEvent[], patterns: ErrorPattern[]): ErrorReport['summary'] {
    const totalErrors = errors.length;
    const uniqueErrors = patterns.length;
    const affectedUsers = new Set(errors.map(e => e.context.userId).filter(Boolean)).size;
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const resolvedErrors = patterns.filter(p => p.rootCause?.identified).length;
    
    // Calculate error rate (simplified)
    const errorRate = totalErrors / Math.max(1, this.getTotalRequests(new Date(), 'day'));
    
    // Calculate MTTR
    const resolvedPatterns = patterns.filter(p => p.rootCause?.identified);
    const meanTimeToResolution = resolvedPatterns.length > 0 ?
      resolvedPatterns.reduce((sum, p) => {
        // Simplified calculation
        return sum + (24 * 60 * 60 * 1000); // 24 hours average
      }, 0) / resolvedPatterns.length : 0;
    
    return {
      totalErrors,
      uniqueErrors,
      affectedUsers,
      errorRate,
      criticalErrors,
      resolvedErrors,
      meanTimeToResolution
    };
  }

  private generateErrorInsights(errors: ErrorEvent[], patterns: ErrorPattern[]): ErrorReport['insights'] {
    // Analyze error hotspots
    const componentCounts = new Map<string, { count: number, severity: string }>();
    errors.forEach(error => {
      const component = error.source.component;
      const existing = componentCounts.get(component) || { count: 0, severity: 'info' };
      existing.count++;
      if (this.getSeverityLevel(error.severity) > this.getSeverityLevel(existing.severity)) {
        existing.severity = error.severity;
      }
      componentCounts.set(component, existing);
    });
    
    const errorHotspots = Array.from(componentCounts.entries())
      .map(([component, data]) => ({
        component,
        errorCount: data.count,
        severity: data.severity
      }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10);
    
    // Analyze time patterns
    const hourlyErrors = new Map<number, { count: number, severity: string }>();
    errors.forEach(error => {
      const hour = error.timestamp.getHours();
      const existing = hourlyErrors.get(hour) || { count: 0, severity: 'info' };
      existing.count++;
      if (this.getSeverityLevel(error.severity) > this.getSeverityLevel(existing.severity)) {
        existing.severity = error.severity;
      }
      hourlyErrors.set(hour, existing);
    });
    
    const timePatterns = Array.from(hourlyErrors.entries())
      .map(([hour, data]) => ({
        hour,
        errorCount: data.count,
        severity: data.severity
      }))
      .sort((a, b) => b.errorCount - a.errorCount);
    
    // Analyze user impact
    const userImpact = new Map<string, { count: number, features: Set<string> }>();
    errors.forEach(error => {
      if (error.context.userId) {
        const userId = error.context.userId;
        const existing = userImpact.get(userId) || { count: 0, features: new Set() };
        existing.count++;
        if (error.context.projectId) {
          existing.features.add(error.context.projectId);
        }
        userImpact.set(userId, existing);
      }
    });
    
    const userImpactArray = Array.from(userImpact.entries())
      .map(([userId, data]) => ({
        userId,
        errorCount: data.count,
        affectedFeatures: Array.from(data.features)
      }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10);
    
    // Platform distribution
    const platformDistribution: Record<string, number> = {};
    errors.forEach(error => {
      platformDistribution[error.context.platform] = 
        (platformDistribution[error.context.platform] || 0) + 1;
    });
    
    return {
      errorHotspots,
      timePatterns,
      userImpact: userImpactArray,
      platformDistribution
    };
  }

  private generateErrorRecommendations(errors: ErrorEvent[], patterns: ErrorPattern[]): ErrorReport['recommendations'] {
    const recommendations: ErrorReport['recommendations'] = [];
    
    // High-frequency errors
    const highFrequencyPatterns = patterns.filter(p => p.occurrences > 10);
    if (highFrequencyPatterns.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'fix',
        title: 'Address High-Frequency Errors',
        description: `${highFrequencyPatterns.length} error patterns have high occurrence rates`,
        impact: 'Reduce error volume by 60-80%',
        effort: 'medium'
      });
    }
    
    // Critical errors
    const criticalErrors = errors.filter(e => e.severity === 'critical');
    if (criticalErrors.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'fix',
        title: 'Resolve Critical Errors',
        description: `${criticalErrors.length} critical errors need immediate attention`,
        impact: 'Prevent system outages and data loss',
        effort: 'high'
      });
    }
    
    // Monitoring improvements
    const unmonitoredComponents = this.identifyUnmonitoredComponents(errors);
    if (unmonitoredComponents.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'monitoring',
        title: 'Improve Error Monitoring',
        description: `Add monitoring for ${unmonitoredComponents.length} components`,
        impact: 'Early detection of issues',
        effort: 'low'
      });
    }
    
    return recommendations;
  }

  private calculateTrends(errors: ErrorEvent[], options: any): Array<{ timestamp: Date; metrics: Record<string, number> }> {
    // Calculate trend data
    return [];
  }

  private groupErrorsByTime(errors: ErrorEvent[], period: string): Map<number, ErrorEvent[]> {
    const grouped = new Map<number, ErrorEvent[]>();
    
    errors.forEach(error => {
      let timeKey: number;
      
      switch (period) {
        case 'hour':
          timeKey = Math.floor(error.timestamp.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000);
          break;
        case 'day':
          timeKey = Math.floor(error.timestamp.getTime() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
          break;
        case 'week':
          timeKey = Math.floor(error.timestamp.getTime() / (7 * 24 * 60 * 60 * 1000)) * (7 * 24 * 60 * 60 * 1000);
          break;
        default:
          timeKey = error.timestamp.getTime();
      }
      
      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, []);
      }
      grouped.get(timeKey)!.push(error);
    });
    
    return grouped;
  }

  private getSeverityLevel(severity: string): number {
    const levels = { debug: 1, info: 2, warning: 3, error: 4, critical: 5 };
    return levels[severity as keyof typeof levels] || 0;
  }

  private calculatePatternTrend(pattern: ErrorPattern): ErrorPattern['trend'] {
    // Simplified trend calculation
    const recentOccurrences = pattern.frequency.daily.slice(-7).reduce((sum, count) => sum + count, 0);
    const previousOccurrences = pattern.frequency.daily.slice(-14, -7).reduce((sum, count) => sum + count, 0);
    
    if (recentOccurrences > previousOccurrences * 1.2) return 'increasing';
    if (recentOccurrences < previousOccurrences * 0.8) return 'decreasing';
    return 'stable';
  }

  private shouldTriggerAlert(error: ErrorEvent, alert: ErrorAlert): boolean {
    // Check if error matches alert conditions
    if (alert.patternId !== error.metadata.fingerprint) return false;
    if (alert.threshold && !this.checkThreshold(error, alert.threshold)) return false;
    return true;
  }

  private checkThreshold(error: ErrorEvent, threshold: ErrorAlert['threshold']): boolean {
    if (!threshold) return true;
    
    // Simplified threshold checking
    const pattern = this.patterns.get(error.metadata.fingerprint);
    if (!pattern) return false;
    
    switch (threshold.metric) {
      case 'count':
        return pattern.occurrences >= threshold.value;
      case 'rate':
        return pattern.occurrences / pattern.affectedUsers >= threshold.value;
      case 'unique_users':
        return pattern.affectedUsers >= threshold.value;
      default:
        return false;
    }
  }

  private isErrorSpike(pattern: ErrorPattern): boolean {
    // Simplified spike detection
    return pattern.occurrences > 10 && pattern.trend === 'increasing';
  }

  private updatePatternResolution(pattern: ErrorPattern, resolution: any): void {
    pattern.rootCause = {
      identified: true,
      category: 'code', // Simplified
      description: resolution.resolution,
      solution: resolution.resolution
    };
  }

  private calculateUserExperienceImpact(error: ErrorEvent): number {
    // Calculate impact on user experience (0-100)
    let impact = 0;
    
    if (error.severity === 'critical') impact += 50;
    else if (error.severity === 'error') impact += 30;
    else if (error.severity === 'warning') impact += 10;
    
    if (error.category === 'user') impact += 20;
    if (error.error.type === 'runtime') impact += 15;
    
    return Math.min(100, impact);
  }

  private calculateSystemStabilityImpact(error: ErrorEvent): number {
    // Calculate impact on system stability (0-100)
    let impact = 0;
    
    if (error.severity === 'critical') impact += 40;
    else if (error.severity === 'error') impact += 25;
    
    if (error.category === 'system') impact += 30;
    if (error.error.type === 'runtime') impact += 20;
    
    return Math.min(100, impact);
  }

  private isBusinessCritical(error: ErrorEvent): boolean {
    // Determine if error is business critical
    return error.severity === 'critical' || 
           error.category === 'security' ||
           error.source.component.includes('payment') ||
           error.source.component.includes('auth');
  }

  private extractAffectedFeatures(error: ErrorEvent): string[] {
    // Extract affected features from error context
    const features = [];
    
    if (error.source.component) {
      features.push(error.source.component);
    }
    
    if (error.context.projectId) {
      features.push(error.context.projectId);
    }
    
    return features;
  }

  private generatePatternName(error: ErrorEvent): string {
    return `${error.source.component}: ${error.error.name}`;
  }

  private getTotalRequests(timestamp: Date, period: string): number {
    // Mock implementation - would get actual request count
    return 1000;
  }

  private calculateAverageResponseTime(errors: ErrorEvent[]): number {
    const responseTimes = errors
      .map(e => e.performance.responseTime)
      .filter(Boolean) as number[];
    
    return responseTimes.length > 0 ?
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
  }

  private calculateAvailability(timestamp: Date, period: string): number {
    // Mock implementation - would calculate actual availability
    return 99.9;
  }

  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-3).reduce((sum, val) => sum + val, 0) / 3;
    const previous = values.slice(-6, -3).reduce((sum, val) => sum + val, 0) / 3;
    
    if (recent > previous * 1.1) return 'up';
    if (recent < previous * 0.9) return 'down';
    return 'stable';
  }

  private calculateChangePercent(values: number[]): number {
    if (values.length < 2) return 0;
    
    const recent = values[values.length - 1];
    const previous = values[values.length - 2];
    
    return previous === 0 ? 0 : ((recent - previous) / previous) * 100;
  }

  private identifyUnmonitoredComponents(errors: ErrorEvent[]): string[] {
    // Identify components that might need better monitoring
    const componentCounts = new Map<string, number>();
    errors.forEach(error => {
      const component = error.source.component;
      componentCounts.set(component, (componentCounts.get(component) || 0) + 1);
    });
    
    return Array.from(componentCounts.entries())
      .filter(([_, count]) => count > 5) // Components with multiple errors
      .map(([component, _]) => component)
      .slice(0, 5);
  }

  private startProcessing(): void {
    // Start background processing
    setInterval(() => {
      this.processPatterns();
      this.cleanupOldData();
    }, 60000); // Every minute
  }

  private processPatterns(): void {
    // Update pattern trends and metrics
    for (const pattern of this.patterns.values()) {
      pattern.trend = this.calculatePatternTrend(pattern);
    }
  }

  private cleanupOldData(): void {
    // Clean up old errors and patterns
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    
    for (const [id, error] of this.errors.entries()) {
      if (error.timestamp < cutoff) {
        this.errors.delete(id);
      }
    }
  }

  // ID generators
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePatternId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting classes
class AIErrorAnalyzer {
  async analyze(error: ErrorEvent, context: any): Promise<AIErrorAnalysis> {
    // Mock AI analysis - would use actual ML models
    return {
      id: `analysis_${Date.now()}`,
      errorId: error.id,
      analysis: {
        rootCauseHypotheses: [
          {
            hypothesis: 'Null pointer exception due to missing validation',
            confidence: 0.85,
            evidence: ['Stack trace pattern', 'Similar errors in component'],
            category: 'code'
          }
        ],
        similarErrors: context.similarErrors.map((e: ErrorEvent) => ({
          errorId: e.id,
          similarity: 0.8,
          resolution: 'Fixed by adding null check'
        })),
        impact: {
          severity: 75,
          scope: 'feature',
          affectedFeatures: [error.source.component],
          estimatedDowntime: 0
        },
        solutions: [
          {
            solution: 'Add null validation before accessing object properties',
            confidence: 0.9,
            complexity: 'low',
            estimatedTime: 2,
            preventionMeasures: ['Add TypeScript strict mode', 'Add unit tests']
          }
        ]
      },
      generatedAt: new Date()
    };
  }
}

class ErrorPatternDetector {
  detectPatterns(errors: ErrorEvent[]): ErrorPattern[] {
    // Implement pattern detection algorithms
    return [];
  }
}

class ErrorAlertManager {
  async processAlert(alert: ErrorAlert): Promise<void> {
    // Process alert actions
    for (const action of alert.actions) {
      await this.executeAction(action, alert);
    }
  }

  async triggerAlert(alert: ErrorAlert, error: ErrorEvent): Promise<void> {
    // Trigger alert notifications
    console.log(`Alert triggered: ${alert.title} for error ${error.id}`);
  }

  private async executeAction(action: AlertAction, alert: ErrorAlert): Promise<void> {
    // Execute alert action
    action.executed = true;
    action.executedAt = new Date();
  }
}

class ErrorFingerprinter {
  generate(errorData: Partial<ErrorEvent>): string {
    // Generate fingerprint for error grouping
    const components = [
      errorData.source?.component,
      errorData.error?.name,
      errorData.error?.type,
      this.normalizeMessage(errorData.error?.message || '')
    ].filter(Boolean);
    
    return this.hash(components.join('|'));
  }

  private normalizeMessage(message: string): string {
    // Remove dynamic parts from error messages
    return message
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // Replace UUIDs
      .replace(/\/.*?\//g, '/PATH/'); // Replace file paths
  }

  private hash(input: string): string {
    // Simple hash function - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

export {
  type ErrorEvent,
  type ErrorPattern,
  type ErrorAlert,
  type ErrorReport,
  type ErrorMetrics,
  type AIErrorAnalysis
};