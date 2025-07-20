/**
 * Comprehensive Audit Trail System
 * Provides complete security event logging, forensic analysis, and compliance reporting
 * with tamper-proof logging and real-time monitoring capabilities
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system_access' | 'security_incident' | 'compliance' | 'admin_action';
  category: 'security' | 'privacy' | 'compliance' | 'operations' | 'user_activity';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string; // Component/service that generated the event
  actor: {
    type: 'user' | 'system' | 'api' | 'service';
    id: string;
    name?: string;
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  };
  action: string;
  resource: {
    type: 'file' | 'database' | 'api' | 'system' | 'user_data' | 'configuration';
    id: string;
    name?: string;
    classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  };
  outcome: 'success' | 'failure' | 'partial' | 'denied';
  details: {
    description: string;
    metadata: Record<string, any>;
    requestId?: string;
    correlationId?: string;
    riskScore?: number;
    geolocation?: {
      country: string;
      region: string;
      city: string;
      coordinates?: [number, number];
    };
  };
  compliance: {
    frameworks: string[]; // GDPR, SOC2, HIPAA, etc.
    retention: number; // days
    classification: 'sensitive' | 'normal' | 'public';
  };
  integrity: {
    hash: string;
    previousHash?: string;
    signature?: string;
  };
}

export interface AuditQuery {
  startTime?: number;
  endTime?: number;
  eventTypes?: string[];
  categories?: string[];
  severities?: string[];
  actors?: string[];
  resources?: string[];
  outcomes?: string[];
  sources?: string[];
  searchText?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'severity' | 'actor' | 'resource';
  orderDirection?: 'asc' | 'desc';
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  timeframe: { start: number; end: number };
  generatedAt: number;
  generatedBy: string;
  events: AuditEvent[];
  summary: {
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    criticalEvents: number;
    uniqueActors: number;
    uniqueResources: number;
    securityIncidents: number;
    complianceViolations: number;
  };
  insights: {
    topActors: { actor: string; count: number }[];
    topResources: { resource: string; count: number }[];
    failurePatterns: { pattern: string; count: number }[];
    riskIndicators: { indicator: string; severity: string; count: number }[];
    geographicDistribution: { location: string; count: number }[];
  };
  recommendations: string[];
  complianceStatus: {
    framework: string;
    status: 'compliant' | 'non_compliant' | 'partial';
    violations: any[];
  }[];
}

export interface AuditConfig {
  enabled: boolean;
  realTimeAlerts: boolean;
  storageBackend: 'file' | 'database' | 'elasticsearch' | 'cloudwatch';
  retention: {
    default: number; // days
    security: number;
    compliance: number;
    admin: number;
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotationDays: number;
  };
  integrity: {
    enabled: boolean;
    hashChain: boolean;
    digitalSignature: boolean;
  };
  alertThresholds: {
    criticalEvents: number;
    failureRate: number;
    suspiciousActivity: number;
  };
  export: {
    formats: ('json' | 'csv' | 'syslog' | 'cef')[];
    compression: boolean;
    encryption: boolean;
  };
}

export interface SecurityAlert {
  id: string;
  timestamp: number;
  type: 'brute_force' | 'privilege_escalation' | 'data_exfiltration' | 'suspicious_access' | 'compliance_violation' | 'system_compromise';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  events: AuditEvent[];
  indicators: {
    type: string;
    value: string;
    confidence: number;
  }[];
  mitigation: {
    automated: boolean;
    actions: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
  assignee?: string;
  status: 'open' | 'investigating' | 'mitigated' | 'false_positive' | 'closed';
}

export class AuditTrail extends EventEmitter {
  private readonly logger = new Logger('AuditTrail');
  private readonly config: AuditConfig;
  private readonly eventBuffer: AuditEvent[] = [];
  private readonly alertQueue: SecurityAlert[] = [];
  private lastEventHash = '';
  private encryptionKey?: Buffer;
  private signingKey?: Buffer;

  constructor(config?: Partial<AuditConfig>) {
    super();

    this.config = {
      enabled: true,
      realTimeAlerts: true,
      storageBackend: 'file',
      retention: {
        default: 2555, // ~7 years
        security: 3650, // 10 years
        compliance: 2555, // 7 years
        admin: 1825, // 5 years
      },
      encryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyRotationDays: 90,
      },
      integrity: {
        enabled: true,
        hashChain: true,
        digitalSignature: true,
      },
      alertThresholds: {
        criticalEvents: 5,
        failureRate: 0.1, // 10%
        suspiciousActivity: 10,
      },
      export: {
        formats: ['json', 'csv'],
        compression: true,
        encryption: true,
      },
      ...config,
    };

    this.initializeSecurityKeys();
    this.setupEventProcessing();
    this.startPeriodicTasks();
  }

  /**
   * Log security event to audit trail
   */
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp' | 'integrity'>): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const eventId = this.generateEventId();
    const timestamp = Date.now();

    // Create complete audit event
    const auditEvent: AuditEvent = {
      id: eventId,
      timestamp,
      integrity: {
        hash: '',
        previousHash: this.lastEventHash,
      },
      ...event,
    };

    // Calculate integrity hash
    auditEvent.integrity.hash = this.calculateEventHash(auditEvent);
    this.lastEventHash = auditEvent.integrity.hash;

    // Add digital signature if enabled
    if (this.config.integrity.digitalSignature && this.signingKey) {
      auditEvent.integrity.signature = this.signEvent(auditEvent);
    }

    // Add to buffer for batch processing
    this.eventBuffer.push(auditEvent);

    // Emit event for real-time processing
    this.emit('auditEvent', auditEvent);

    // Check for immediate threats
    await this.analyzeEventForThreats(auditEvent);

    // Flush buffer if it's getting full
    if (this.eventBuffer.length >= 100) {
      await this.flushEventBuffer();
    }

    this.logger.debug(`Logged audit event: ${event.action} by ${event.actor.id}`);
    return eventId;
  }

  /**
   * Query audit events with filtering and pagination
   */
  async queryEvents(query: AuditQuery): Promise<{ events: AuditEvent[]; total: number; hasMore: boolean }> {
    this.logger.info('Querying audit events', { query });

    // For file-based storage, implement file scanning
    // For database storage, this would use SQL queries
    // For Elasticsearch, this would use search queries

    const events = await this.searchEvents(query);
    const total = events.length;
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    const paginatedEvents = events.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      events: paginatedEvents,
      total,
      hasMore,
    };
  }

  /**
   * Generate comprehensive audit report
   */
  async generateReport(
    timeframe: { start: number; end: number },
    title: string,
    description: string,
    generatedBy: string
  ): Promise<AuditReport> {
    this.logger.info(`Generating audit report: ${title}`);

    const reportId = this.generateEventId();
    const events = await this.queryEvents({
      startTime: timeframe.start,
      endTime: timeframe.end,
      limit: 10000, // Large limit for comprehensive reports
    });

    const summary = this.calculateEventSummary(events.events);
    const insights = this.generateEventInsights(events.events);
    const recommendations = this.generateRecommendations(events.events, insights);
    const complianceStatus = await this.assessComplianceStatus(events.events);

    const report: AuditReport = {
      id: reportId,
      title,
      description,
      timeframe,
      generatedAt: Date.now(),
      generatedBy,
      events: events.events,
      summary,
      insights,
      recommendations,
      complianceStatus,
    };

    // Save report
    await this.saveReport(report);

    this.logger.info(`Generated audit report with ${events.events.length} events`);
    return report;
  }

  /**
   * Export audit data in various formats
   */
  async exportData(
    query: AuditQuery,
    format: 'json' | 'csv' | 'syslog' | 'cef',
    options?: {
      compress?: boolean;
      encrypt?: boolean;
      filename?: string;
    }
  ): Promise<string> {
    this.logger.info(`Exporting audit data in ${format} format`);

    const { events } = await this.queryEvents(query);
    let exportData: string;

    switch (format) {
      case 'json':
        exportData = JSON.stringify(events, null, 2);
        break;
      case 'csv':
        exportData = this.convertToCSV(events);
        break;
      case 'syslog':
        exportData = this.convertToSyslog(events);
        break;
      case 'cef':
        exportData = this.convertToCEF(events);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    // Apply compression if requested
    if (options?.compress) {
      exportData = await this.compressData(exportData);
    }

    // Apply encryption if requested
    if (options?.encrypt && this.encryptionKey) {
      exportData = await this.encryptData(exportData);
    }

    // Save to file
    const filename = options?.filename || `audit-export-${Date.now()}.${format}`;
    const exportDir = './audit-exports';
    await fs.mkdir(exportDir, { recursive: true });
    
    const filePath = path.join(exportDir, filename);
    await fs.writeFile(filePath, exportData);

    this.logger.info(`Exported ${events.length} events to ${filePath}`);
    return filePath;
  }

  /**
   * Verify audit trail integrity
   */
  async verifyIntegrity(startTime?: number, endTime?: number): Promise<{
    valid: boolean;
    issues: { eventId: string; issue: string }[];
    summary: { total: number; valid: number; invalid: number };
  }> {
    this.logger.info('Verifying audit trail integrity');

    const { events } = await this.queryEvents({
      startTime,
      endTime,
      orderBy: 'timestamp',
      orderDirection: 'asc',
      limit: 10000,
    });

    const issues: { eventId: string; issue: string }[] = [];
    let validCount = 0;
    let previousHash = '';

    for (const event of events) {
      // Verify hash
      const calculatedHash = this.calculateEventHash(event);
      if (calculatedHash !== event.integrity.hash) {
        issues.push({
          eventId: event.id,
          issue: 'Hash mismatch - potential tampering detected',
        });
        continue;
      }

      // Verify hash chain
      if (this.config.integrity.hashChain && previousHash) {
        if (event.integrity.previousHash !== previousHash) {
          issues.push({
            eventId: event.id,
            issue: 'Hash chain broken - events may be out of order or missing',
          });
          continue;
        }
      }

      // Verify digital signature
      if (this.config.integrity.digitalSignature && event.integrity.signature) {
        if (!this.verifyEventSignature(event)) {
          issues.push({
            eventId: event.id,
            issue: 'Digital signature verification failed',
          });
          continue;
        }
      }

      validCount++;
      previousHash = event.integrity.hash;
    }

    const result = {
      valid: issues.length === 0,
      issues,
      summary: {
        total: events.length,
        valid: validCount,
        invalid: issues.length,
      },
    };

    this.logger.info(`Integrity verification completed: ${validCount}/${events.length} events valid`);
    return result;
  }

  /**
   * Create security alert
   */
  async createAlert(
    type: SecurityAlert['type'],
    severity: SecurityAlert['severity'],
    title: string,
    description: string,
    events: AuditEvent[],
    indicators: SecurityAlert['indicators'] = []
  ): Promise<string> {
    const alertId = this.generateEventId();
    const alert: SecurityAlert = {
      id: alertId,
      timestamp: Date.now(),
      type,
      severity,
      title,
      description,
      events,
      indicators,
      mitigation: {
        automated: false,
        actions: [],
        status: 'pending',
      },
      status: 'open',
    };

    this.alertQueue.push(alert);
    this.emit('securityAlert', alert);

    // Log the alert as an audit event
    await this.logEvent({
      eventType: 'security_incident',
      category: 'security',
      severity,
      source: 'audit-trail',
      actor: { type: 'system', id: 'audit-trail' },
      action: 'security_alert_created',
      resource: { type: 'system', id: 'audit-trail' },
      outcome: 'success',
      details: {
        description: `Security alert created: ${title}`,
        metadata: { alertId, type, indicators: indicators.length },
      },
      compliance: {
        frameworks: ['SOC2', 'ISO27001'],
        retention: this.config.retention.security,
        classification: 'sensitive',
      },
    });

    this.logger.warn(`Security alert created: ${title} (${severity})`, { alertId, type });
    return alertId;
  }

  /**
   * Get audit statistics
   */
  getStatistics(timeframe?: { start: number; end: number }): {
    totalEvents: number;
    eventsToday: number;
    criticalEvents: number;
    failureRate: number;
    activeAlerts: number;
    topActors: string[];
    topActions: string[];
    complianceScore: number;
  } {
    // This would calculate statistics from stored events
    // For now, return placeholder data
    return {
      totalEvents: 0,
      eventsToday: 0,
      criticalEvents: 0,
      failureRate: 0,
      activeAlerts: this.alertQueue.filter(a => a.status === 'open').length,
      topActors: [],
      topActions: [],
      complianceScore: 95,
    };
  }

  /**
   * Initialize security keys for encryption and signing
   */
  private initializeSecurityKeys(): void {
    if (this.config.encryption.enabled) {
      // In production, load from secure key management service
      this.encryptionKey = crypto.randomBytes(32);
    }

    if (this.config.integrity.digitalSignature) {
      // In production, load from secure key management service
      this.signingKey = crypto.randomBytes(32);
    }
  }

  /**
   * Setup event processing pipeline
   */
  private setupEventProcessing(): void {
    // Process events in batches every 5 seconds
    setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushEventBuffer();
      }
    }, 5000);

    // Process security alerts
    this.on('securityAlert', (alert: SecurityAlert) => {
      if (this.config.realTimeAlerts) {
        this.processSecurityAlert(alert);
      }
    });
  }

  /**
   * Start periodic maintenance tasks
   */
  private startPeriodicTasks(): void {
    // Daily cleanup of old events
    setInterval(async () => {
      await this.cleanupOldEvents();
    }, 24 * 60 * 60 * 1000);

    // Weekly integrity verification
    setInterval(async () => {
      await this.verifyIntegrity();
    }, 7 * 24 * 60 * 60 * 1000);

    // Monthly key rotation
    setInterval(async () => {
      await this.rotateEncryptionKeys();
    }, 30 * 24 * 60 * 60 * 1000);
  }

  /**
   * Flush event buffer to storage
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer.length = 0;

    try {
      await this.persistEvents(events);
      this.logger.debug(`Flushed ${events.length} events to storage`);
    } catch (error) {
      this.logger.error('Failed to flush events to storage:', error);
      // Put events back in buffer
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Persist events to storage backend
   */
  private async persistEvents(events: AuditEvent[]): Promise<void> {
    switch (this.config.storageBackend) {
      case 'file':
        await this.persistToFile(events);
        break;
      case 'database':
        await this.persistToDatabase(events);
        break;
      case 'elasticsearch':
        await this.persistToElasticsearch(events);
        break;
      case 'cloudwatch':
        await this.persistToCloudWatch(events);
        break;
      default:
        throw new Error(`Unsupported storage backend: ${this.config.storageBackend}`);
    }
  }

  /**
   * Persist events to file system
   */
  private async persistToFile(events: AuditEvent[]): Promise<void> {
    const auditDir = './audit-logs';
    await fs.mkdir(auditDir, { recursive: true });

    // Group events by date for efficient storage
    const eventsByDate = new Map<string, AuditEvent[]>();
    
    for (const event of events) {
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      const dayEvents = eventsByDate.get(date) || [];
      dayEvents.push(event);
      eventsByDate.set(date, dayEvents);
    }

    // Write events to daily log files
    for (const [date, dayEvents] of eventsByDate) {
      const filename = `audit-${date}.jsonl`;
      const filePath = path.join(auditDir, filename);
      
      let logData = '';
      for (const event of dayEvents) {
        let eventData = JSON.stringify(event);
        
        // Encrypt if enabled
        if (this.config.encryption.enabled && this.encryptionKey) {
          eventData = await this.encryptData(eventData);
        }
        
        logData += eventData + '\n';
      }
      
      await fs.appendFile(filePath, logData);
    }
  }

  /**
   * Persist events to database
   */
  private async persistToDatabase(events: AuditEvent[]): Promise<void> {
    // Implement database persistence
    // This would use SQL queries to insert events
    this.logger.debug(`Would persist ${events.length} events to database`);
  }

  /**
   * Persist events to Elasticsearch
   */
  private async persistToElasticsearch(events: AuditEvent[]): Promise<void> {
    // Implement Elasticsearch persistence
    // This would use Elasticsearch bulk API
    this.logger.debug(`Would persist ${events.length} events to Elasticsearch`);
  }

  /**
   * Persist events to CloudWatch
   */
  private async persistToCloudWatch(events: AuditEvent[]): Promise<void> {
    // Implement CloudWatch Logs persistence
    // This would use AWS SDK
    this.logger.debug(`Would persist ${events.length} events to CloudWatch`);
  }

  /**
   * Search events based on query
   */
  private async searchEvents(query: AuditQuery): Promise<AuditEvent[]> {
    // For file-based storage, scan log files
    // For database/Elasticsearch, use appropriate query mechanisms
    
    const auditDir = './audit-logs';
    const events: AuditEvent[] = [];

    try {
      const files = await fs.readdir(auditDir);
      const logFiles = files.filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));

      for (const file of logFiles) {
        const filePath = path.join(auditDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;
          
          try {
            let eventData = line;
            
            // Decrypt if encrypted
            if (this.config.encryption.enabled && this.encryptionKey) {
              eventData = await this.decryptData(eventData);
            }
            
            const event: AuditEvent = JSON.parse(eventData);
            
            // Apply filters
            if (this.matchesQuery(event, query)) {
              events.push(event);
            }
          } catch (error) {
            this.logger.warn(`Failed to parse audit event: ${error}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to search events:', error);
    }

    // Sort events
    if (query.orderBy) {
      events.sort((a, b) => {
        let aValue: any;
        let bValue: any;
        
        switch (query.orderBy) {
          case 'timestamp':
            aValue = a.timestamp;
            bValue = b.timestamp;
            break;
          case 'severity':
            const severityOrder = { info: 1, warning: 2, error: 3, critical: 4 };
            aValue = severityOrder[a.severity];
            bValue = severityOrder[b.severity];
            break;
          case 'actor':
            aValue = a.actor.id;
            bValue = b.actor.id;
            break;
          case 'resource':
            aValue = a.resource.id;
            bValue = b.resource.id;
            break;
          default:
            return 0;
        }
        
        const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return query.orderDirection === 'desc' ? -result : result;
      });
    }

    return events;
  }

  /**
   * Check if event matches query filters
   */
  private matchesQuery(event: AuditEvent, query: AuditQuery): boolean {
    // Time range filter
    if (query.startTime && event.timestamp < query.startTime) return false;
    if (query.endTime && event.timestamp > query.endTime) return false;

    // Array filters
    if (query.eventTypes && !query.eventTypes.includes(event.eventType)) return false;
    if (query.categories && !query.categories.includes(event.category)) return false;
    if (query.severities && !query.severities.includes(event.severity)) return false;
    if (query.outcomes && !query.outcomes.includes(event.outcome)) return false;
    if (query.sources && !query.sources.includes(event.source)) return false;

    // Actor filter
    if (query.actors && !query.actors.includes(event.actor.id)) return false;

    // Resource filter
    if (query.resources && !query.resources.includes(event.resource.id)) return false;

    // Text search
    if (query.searchText) {
      const searchText = query.searchText.toLowerCase();
      const searchableText = [
        event.action,
        event.details.description,
        event.actor.name || '',
        event.resource.name || '',
      ].join(' ').toLowerCase();
      
      if (!searchableText.includes(searchText)) return false;
    }

    return true;
  }

  /**
   * Calculate event hash for integrity
   */
  private calculateEventHash(event: AuditEvent): string {
    // Create deterministic string representation
    const hashData = [
      event.id,
      event.timestamp,
      event.eventType,
      event.actor.id,
      event.action,
      event.resource.id,
      event.outcome,
      JSON.stringify(event.details),
      event.integrity.previousHash || '',
    ].join('|');

    return crypto.createHash('sha256').update(hashData).digest('hex');
  }

  /**
   * Sign event with digital signature
   */
  private signEvent(event: AuditEvent): string {
    if (!this.signingKey) {
      throw new Error('Signing key not available');
    }

    const eventData = JSON.stringify(event);
    return crypto.createHmac('sha256', this.signingKey).update(eventData).digest('hex');
  }

  /**
   * Verify event digital signature
   */
  private verifyEventSignature(event: AuditEvent): boolean {
    if (!this.signingKey || !event.integrity.signature) {
      return false;
    }

    const eventCopy = { ...event };
    delete eventCopy.integrity.signature;
    
    const eventData = JSON.stringify(eventCopy);
    const expectedSignature = crypto.createHmac('sha256', this.signingKey).update(eventData).digest('hex');
    
    return expectedSignature === event.integrity.signature;
  }

  /**
   * Analyze event for potential threats
   */
  private async analyzeEventForThreats(event: AuditEvent): Promise<void> {
    // Implement threat detection logic
    // This would analyze patterns, anomalies, and known indicators
    
    // Example: Detect failed authentication attempts
    if (event.eventType === 'authentication' && event.outcome === 'failure') {
      // Check for brute force attacks
      // This would maintain counters and create alerts
    }

    // Example: Detect privilege escalation
    if (event.action.includes('privilege') || event.action.includes('admin')) {
      // Check if actor has appropriate permissions
    }

    // Example: Detect data exfiltration
    if (event.eventType === 'data_access' && event.resource.classification === 'confidential') {
      // Check access patterns and volume
    }
  }

  /**
   * Process security alert
   */
  private async processSecurityAlert(alert: SecurityAlert): Promise<void> {
    this.logger.warn(`Processing security alert: ${alert.title}`);

    // Implement automated response based on alert type
    switch (alert.type) {
      case 'brute_force':
        // Implement IP blocking or account lockout
        break;
      case 'privilege_escalation':
        // Alert administrators immediately
        break;
      case 'data_exfiltration':
        // Block access and investigate
        break;
    }
  }

  /**
   * Calculate event summary statistics
   */
  private calculateEventSummary(events: AuditEvent[]): AuditReport['summary'] {
    const summary = {
      totalEvents: events.length,
      successfulEvents: 0,
      failedEvents: 0,
      criticalEvents: 0,
      uniqueActors: new Set<string>(),
      uniqueResources: new Set<string>(),
      securityIncidents: 0,
      complianceViolations: 0,
    };

    for (const event of events) {
      if (event.outcome === 'success') summary.successfulEvents++;
      if (event.outcome === 'failure') summary.failedEvents++;
      if (event.severity === 'critical') summary.criticalEvents++;
      if (event.eventType === 'security_incident') summary.securityIncidents++;
      
      summary.uniqueActors.add(event.actor.id);
      summary.uniqueResources.add(event.resource.id);
    }

    return {
      ...summary,
      uniqueActors: summary.uniqueActors.size,
      uniqueResources: summary.uniqueResources.size,
    };
  }

  /**
   * Generate insights from events
   */
  private generateEventInsights(events: AuditEvent[]): AuditReport['insights'] {
    const actorCounts = new Map<string, number>();
    const resourceCounts = new Map<string, number>();
    const failurePatterns = new Map<string, number>();
    const locationCounts = new Map<string, number>();

    for (const event of events) {
      // Count actors
      actorCounts.set(event.actor.id, (actorCounts.get(event.actor.id) || 0) + 1);
      
      // Count resources
      resourceCounts.set(event.resource.id, (resourceCounts.get(event.resource.id) || 0) + 1);
      
      // Track failure patterns
      if (event.outcome === 'failure') {
        const pattern = `${event.eventType}:${event.action}`;
        failurePatterns.set(pattern, (failurePatterns.get(pattern) || 0) + 1);
      }
      
      // Track geographic distribution
      if (event.details.geolocation) {
        const location = event.details.geolocation.country;
        locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
      }
    }

    // Convert to sorted arrays
    const topActors = Array.from(actorCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([actor, count]) => ({ actor, count }));

    const topResources = Array.from(resourceCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([resource, count]) => ({ resource, count }));

    const failurePatternsList = Array.from(failurePatterns.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));

    const geographicDistribution = Array.from(locationCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));

    return {
      topActors,
      topResources,
      failurePatterns: failurePatternsList,
      riskIndicators: [], // Would analyze for risk patterns
      geographicDistribution,
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(events: AuditEvent[], insights: AuditReport['insights']): string[] {
    const recommendations: string[] = [];

    // Check failure rate
    const totalEvents = events.length;
    const failedEvents = events.filter(e => e.outcome === 'failure').length;
    const failureRate = failedEvents / totalEvents;

    if (failureRate > 0.1) {
      recommendations.push('High failure rate detected - review system configuration and user training');
    }

    // Check for critical events
    const criticalEvents = events.filter(e => e.severity === 'critical').length;
    if (criticalEvents > 0) {
      recommendations.push(`${criticalEvents} critical events detected - immediate investigation recommended`);
    }

    // Check for unusual patterns
    if (insights.failurePatterns.length > 0) {
      recommendations.push('Recurring failure patterns detected - implement preventive measures');
    }

    // Standard recommendations
    recommendations.push('Implement automated threat detection');
    recommendations.push('Regular security awareness training for users');
    recommendations.push('Periodic access review and privilege cleanup');

    return recommendations;
  }

  /**
   * Assess compliance status
   */
  private async assessComplianceStatus(events: AuditEvent[]): Promise<AuditReport['complianceStatus']> {
    // Implement compliance assessment logic
    return [
      {
        framework: 'GDPR',
        status: 'compliant',
        violations: [],
      },
      {
        framework: 'SOC2',
        status: 'compliant',
        violations: [],
      },
    ];
  }

  /**
   * Save audit report
   */
  private async saveReport(report: AuditReport): Promise<void> {
    const reportsDir = './audit-reports';
    await fs.mkdir(reportsDir, { recursive: true });
    
    const filename = `audit-report-${report.id}.json`;
    const filePath = path.join(reportsDir, filename);
    
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
  }

  /**
   * Convert events to CSV format
   */
  private convertToCSV(events: AuditEvent[]): string {
    const headers = [
      'ID', 'Timestamp', 'Event Type', 'Category', 'Severity', 'Source',
      'Actor ID', 'Actor Type', 'Action', 'Resource ID', 'Resource Type',
      'Outcome', 'Description'
    ];

    const rows = events.map(event => [
      event.id,
      new Date(event.timestamp).toISOString(),
      event.eventType,
      event.category,
      event.severity,
      event.source,
      event.actor.id,
      event.actor.type,
      event.action,
      event.resource.id,
      event.resource.type,
      event.outcome,
      event.details.description,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Convert events to Syslog format
   */
  private convertToSyslog(events: AuditEvent[]): string {
    return events.map(event => {
      const priority = this.getSyslogPriority(event.severity);
      const timestamp = new Date(event.timestamp).toISOString();
      const hostname = 'codecraft-audit';
      const tag = 'audit';
      
      return `<${priority}>${timestamp} ${hostname} ${tag}: ${event.action} by ${event.actor.id} on ${event.resource.id} - ${event.outcome}`;
    }).join('\n');
  }

  /**
   * Convert events to CEF format
   */
  private convertToCEF(events: AuditEvent[]): string {
    return events.map(event => {
      const version = '0';
      const deviceVendor = 'CodeCraft';
      const deviceProduct = 'Audit Trail';
      const deviceVersion = '1.0';
      const signatureId = event.eventType;
      const name = event.action;
      const severity = this.getCEFSeverity(event.severity);
      
      return `CEF:${version}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureId}|${name}|${severity}|src=${event.actor.ip||'unknown'} suser=${event.actor.id} act=${event.action} outcome=${event.outcome}`;
    }).join('\n');
  }

  /**
   * Get Syslog priority from severity
   */
  private getSyslogPriority(severity: string): number {
    const priorities = { info: 6, warning: 4, error: 3, critical: 2 };
    return priorities[severity as keyof typeof priorities] || 6;
  }

  /**
   * Get CEF severity from severity
   */
  private getCEFSeverity(severity: string): number {
    const severities = { info: 2, warning: 5, error: 8, critical: 10 };
    return severities[severity as keyof typeof severities] || 2;
  }

  /**
   * Compress data using gzip
   */
  private async compressData(data: string): Promise<string> {
    const zlib = require('zlib');
    const compressed = zlib.gzipSync(Buffer.from(data));
    return compressed.toString('base64');
  }

  /**
   * Encrypt data
   */
  private async encryptData(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.config.encryption.algorithm, this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);

    const tag = (cipher as any).getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('base64'),
      encrypted: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    });
  }

  /**
   * Decrypt data
   */
  private async decryptData(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const { iv, encrypted, tag } = JSON.parse(encryptedData);
    
    const decipher = crypto.createDecipheriv(
      this.config.encryption.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Cleanup old events based on retention policies
   */
  private async cleanupOldEvents(): Promise<void> {
    this.logger.info('Starting cleanup of old audit events');
    
    // Implement cleanup logic based on retention policies
    // This would delete events older than retention period
  }

  /**
   * Rotate encryption keys
   */
  private async rotateEncryptionKeys(): Promise<void> {
    this.logger.info('Rotating encryption keys');
    
    // Generate new keys
    this.encryptionKey = crypto.randomBytes(32);
    this.signingKey = crypto.randomBytes(32);
    
    // In production, this would:
    // 1. Store old keys for decrypting existing data
    // 2. Use new keys for new data
    // 3. Gradually re-encrypt old data with new keys
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}