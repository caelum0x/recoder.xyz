/**
 * AI-Powered Threat Detection System
 * Advanced threat detection using machine learning, behavioral analysis, and pattern recognition
 * to identify and respond to security threats in real-time
 */

import { EventEmitter } from 'events';
import { Logger } from '@recoder/shared';
import { AuditEvent } from './audit-trail';

export interface ThreatSignature {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'malware' | 'intrusion' | 'data_breach' | 'privilege_escalation' | 'anomaly' | 'abuse';
  patterns: {
    type: 'regex' | 'sequence' | 'frequency' | 'statistical' | 'ml_model';
    rules: any[];
    threshold: number;
    timeWindow?: number; // milliseconds
  };
  indicators: {
    type: 'ip' | 'user' | 'file' | 'command' | 'api_call' | 'behavior';
    values: string[];
    weight: number;
  }[];
  mitre: {
    tactics: string[];
    techniques: string[];
    subtechniques?: string[];
  };
  response: {
    automated: boolean;
    actions: ('block' | 'quarantine' | 'alert' | 'log' | 'investigate')[];
    escalation: boolean;
  };
}

export interface ThreatIntelligence {
  id: string;
  type: 'ioc' | 'ttp' | 'vulnerability' | 'campaign';
  source: string;
  confidence: number; // 0-100
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  indicators: {
    type: 'ip' | 'domain' | 'hash' | 'url' | 'email' | 'user_agent';
    value: string;
    context: string;
  }[];
  description: string;
  firstSeen: number;
  lastSeen: number;
  tags: string[];
  references: string[];
  killChain?: string[];
}

export interface ThreatEvent {
  id: string;
  timestamp: number;
  type: 'detection' | 'incident' | 'investigation' | 'response';
  signature: ThreatSignature;
  confidence: number; // 0-100
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  target: {
    type: 'user' | 'system' | 'network' | 'application';
    id: string;
    name?: string;
    ip?: string;
    location?: string;
  };
  evidence: {
    events: AuditEvent[];
    artifacts: string[];
    timeline: { timestamp: number; description: string }[];
    indicators: { type: string; value: string; confidence: number }[];
  };
  context: {
    campaign?: string;
    attacker?: string;
    killChainPhase?: string;
    relatedThreats: string[];
  };
  status: 'new' | 'investigating' | 'contained' | 'mitigated' | 'false_positive' | 'closed';
  assignee?: string;
  response: {
    automated: boolean;
    actions: string[];
    effectiveness: number; // 0-100
    timestamp: number;
  };
}

export interface BehaviorProfile {
  entityId: string;
  entityType: 'user' | 'system' | 'application';
  baseline: {
    loginTimes: number[]; // Hour of day (0-23)
    locations: string[];
    devices: string[];
    activities: { action: string; frequency: number }[];
    networkTraffic: { destination: string; volume: number }[];
    accessPatterns: { resource: string; frequency: number }[];
  };
  current: {
    riskScore: number; // 0-100
    anomalies: {
      type: string;
      severity: number;
      description: string;
      timestamp: number;
    }[];
    lastUpdated: number;
  };
  learning: {
    enabled: boolean;
    samples: number;
    confidence: number;
    lastTrained: number;
  };
}

export interface ThreatHuntingQuery {
  id: string;
  name: string;
  description: string;
  query: string;
  language: 'sql' | 'kql' | 'elasticsearch' | 'regex';
  frequency: 'continuous' | 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
  tags: string[];
  author: string;
  created: number;
  lastRun?: number;
  results?: {
    timestamp: number;
    matches: number;
    findings: any[];
  };
}

export interface ThreatDetectionConfig {
  enabled: boolean;
  realTimeMonitoring: boolean;
  behaviorAnalysis: boolean;
  threatIntelligence: boolean;
  machineLearning: boolean;
  responseAutomation: boolean;
  huntingQueries: boolean;
  confidenceThreshold: number; // 0-100
  alertThresholds: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  learningPeriod: number; // days
  retentionPeriod: number; // days
  integrations: {
    siem?: { url: string; apiKey: string };
    threatIntel?: { feeds: string[]; apiKeys: Record<string, string> };
    soar?: { url: string; apiKey: string };
  };
}

export class ThreatDetectionEngine extends EventEmitter {
  private readonly logger = new Logger('ThreatDetection');
  private readonly config: ThreatDetectionConfig;
  private readonly signatures = new Map<string, ThreatSignature>();
  private readonly threatIntel = new Map<string, ThreatIntelligence>();
  private readonly behaviorProfiles = new Map<string, BehaviorProfile>();
  private readonly huntingQueries = new Map<string, ThreatHuntingQuery>();
  private readonly threatEvents: ThreatEvent[] = [];
  private readonly eventBuffer: AuditEvent[] = [];
  private mlModels = new Map<string, any>();

  constructor(config?: Partial<ThreatDetectionConfig>) {
    super();

    this.config = {
      enabled: true,
      realTimeMonitoring: true,
      behaviorAnalysis: true,
      threatIntelligence: true,
      machineLearning: false, // Disabled by default due to complexity
      responseAutomation: false, // Disabled by default for safety
      huntingQueries: true,
      confidenceThreshold: 70,
      alertThresholds: {
        critical: 1,
        high: 5,
        medium: 10,
        low: 20,
      },
      learningPeriod: 30,
      retentionPeriod: 365,
      integrations: {},
      ...config,
    };

    this.loadThreatSignatures();
    this.loadThreatIntelligence();
    this.loadHuntingQueries();
    this.startThreatDetection();
  }

  /**
   * Analyze event for threats
   */
  async analyzeEvent(event: AuditEvent): Promise<ThreatEvent[]> {
    if (!this.config.enabled) {
      return [];
    }

    this.eventBuffer.push(event);
    const threats: ThreatEvent[] = [];

    // Real-time signature matching
    for (const [signatureId, signature] of this.signatures) {
      const detection = await this.matchSignature(event, signature);
      if (detection) {
        threats.push(detection);
      }
    }

    // Threat intelligence correlation
    if (this.config.threatIntelligence) {
      const intelThreats = await this.correlateThreatIntelligence(event);
      threats.push(...intelThreats);
    }

    // Behavioral analysis
    if (this.config.behaviorAnalysis) {
      const behaviorThreats = await this.analyzeBehavior(event);
      threats.push(...behaviorThreats);
    }

    // Machine learning analysis
    if (this.config.machineLearning) {
      const mlThreats = await this.runMLAnalysis(event);
      threats.push(...mlThreats);
    }

    // Process threats
    for (const threat of threats) {
      if (threat.confidence >= this.config.confidenceThreshold) {
        await this.processThreatEvent(threat);
      }
    }

    return threats;
  }

  /**
   * Hunt for threats using custom queries
   */
  async huntThreats(queryId?: string): Promise<{ query: ThreatHuntingQuery; results: any[] }[]> {
    this.logger.info('Starting threat hunting');

    const results: { query: ThreatHuntingQuery; results: any[] }[] = [];
    const queriesToRun = queryId 
      ? [this.huntingQueries.get(queryId)].filter(Boolean)
      : Array.from(this.huntingQueries.values()).filter(q => q.enabled);

    for (const query of queriesToRun) {
      try {
        this.logger.debug(`Running hunting query: ${query.name}`);
        
        const queryResults = await this.executeHuntingQuery(query);
        results.push({ query, results: queryResults });

        // Update query metadata
        query.lastRun = Date.now();
        query.results = {
          timestamp: Date.now(),
          matches: queryResults.length,
          findings: queryResults,
        };

        // Create threat events for significant findings
        if (queryResults.length > 0) {
          await this.createThreatFromHunt(query, queryResults);
        }

      } catch (error) {
        this.logger.error(`Failed to execute hunting query ${query.name}:`, error);
      }
    }

    this.logger.info(`Threat hunting completed: ${results.length} queries executed`);
    return results;
  }

  /**
   * Update behavioral baseline for entity
   */
  async updateBehaviorProfile(entityId: string, entityType: 'user' | 'system' | 'application', events: AuditEvent[]): Promise<void> {
    let profile = this.behaviorProfiles.get(entityId);
    
    if (!profile) {
      profile = this.createNewBehaviorProfile(entityId, entityType);
      this.behaviorProfiles.set(entityId, profile);
    }

    // Update baseline from events
    for (const event of events) {
      this.updateBaselineFromEvent(profile, event);
    }

    // Calculate current risk score
    profile.current.riskScore = await this.calculateRiskScore(profile, events);
    profile.current.lastUpdated = Date.now();

    // Update learning metadata
    profile.learning.samples += events.length;
    profile.learning.confidence = Math.min(profile.learning.samples / 1000, 1.0);

    this.logger.debug(`Updated behavior profile for ${entityId}: risk score ${profile.current.riskScore}`);
  }

  /**
   * Add custom threat signature
   */
  addThreatSignature(signature: ThreatSignature): void {
    this.signatures.set(signature.id, signature);
    this.logger.info(`Added threat signature: ${signature.name}`);
  }

  /**
   * Add threat intelligence indicator
   */
  addThreatIntelligence(intel: ThreatIntelligence): void {
    this.threatIntel.set(intel.id, intel);
    this.logger.info(`Added threat intelligence: ${intel.type} from ${intel.source}`);
  }

  /**
   * Get threat dashboard data
   */
  getThreatDashboard(): {
    activeThreats: number;
    criticalThreats: number;
    investigationsOpen: number;
    riskScore: number;
    recentThreats: ThreatEvent[];
    topAttackTypes: { type: string; count: number }[];
    threatTrends: { date: string; count: number }[];
    behaviorAnomalies: number;
  } {
    const activeThreats = this.threatEvents.filter(t => 
      ['new', 'investigating', 'contained'].includes(t.status)
    );

    const criticalThreats = activeThreats.filter(t => t.severity === 'critical');
    const investigationsOpen = activeThreats.filter(t => t.status === 'investigating');

    // Calculate overall risk score
    const riskScore = activeThreats.length > 0 
      ? Math.min(activeThreats.reduce((sum, t) => sum + t.confidence, 0) / activeThreats.length, 100)
      : 0;

    // Get recent threats (last 24 hours)
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentThreats = this.threatEvents
      .filter(t => t.timestamp > dayAgo)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    // Count attack types
    const attackTypeCounts = new Map<string, number>();
    for (const threat of this.threatEvents) {
      const type = threat.signature.category;
      attackTypeCounts.set(type, (attackTypeCounts.get(type) || 0) + 1);
    }

    const topAttackTypes = Array.from(attackTypeCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // Count behavior anomalies
    const behaviorAnomalies = Array.from(this.behaviorProfiles.values())
      .reduce((sum, profile) => sum + profile.current.anomalies.length, 0);

    return {
      activeThreats: activeThreats.length,
      criticalThreats: criticalThreats.length,
      investigationsOpen: investigationsOpen.length,
      riskScore: Math.round(riskScore),
      recentThreats,
      topAttackTypes,
      threatTrends: [], // Would calculate from historical data
      behaviorAnomalies,
    };
  }

  /**
   * Load built-in threat signatures
   */
  private loadThreatSignatures(): void {
    const signatures: ThreatSignature[] = [
      // Brute Force Attack
      {
        id: 'brute-force-login',
        name: 'Brute Force Authentication Attack',
        description: 'Multiple failed authentication attempts from same source',
        severity: 'high',
        category: 'intrusion',
        patterns: {
          type: 'frequency',
          rules: [
            { field: 'eventType', value: 'authentication' },
            { field: 'outcome', value: 'failure' },
            { field: 'actor.ip', operator: 'same' }
          ],
          threshold: 5,
          timeWindow: 300000, // 5 minutes
        },
        indicators: [
          { type: 'ip', values: [], weight: 0.8 },
          { type: 'user', values: [], weight: 0.6 }
        ],
        mitre: {
          tactics: ['Initial Access', 'Credential Access'],
          techniques: ['T1110', 'T1078'],
        },
        response: {
          automated: true,
          actions: ['block', 'alert'],
          escalation: false,
        },
      },

      // Privilege Escalation
      {
        id: 'privilege-escalation',
        name: 'Privilege Escalation Attempt',
        description: 'User attempting to access resources above their privilege level',
        severity: 'critical',
        category: 'privilege_escalation',
        patterns: {
          type: 'sequence',
          rules: [
            { field: 'eventType', value: 'authorization' },
            { field: 'outcome', value: 'denied' },
            { field: 'resource.classification', value: 'restricted' }
          ],
          threshold: 3,
          timeWindow: 600000, // 10 minutes
        },
        indicators: [
          { type: 'user', values: [], weight: 0.9 },
          { type: 'behavior', values: ['privilege_request'], weight: 0.7 }
        ],
        mitre: {
          tactics: ['Privilege Escalation', 'Defense Evasion'],
          techniques: ['T1068', 'T1548'],
        },
        response: {
          automated: false,
          actions: ['alert', 'investigate'],
          escalation: true,
        },
      },

      // Data Exfiltration
      {
        id: 'data-exfiltration',
        name: 'Potential Data Exfiltration',
        description: 'Unusual large volume data access patterns',
        severity: 'critical',
        category: 'data_breach',
        patterns: {
          type: 'statistical',
          rules: [
            { field: 'eventType', value: 'data_access' },
            { field: 'details.metadata.size', operator: 'anomaly', baseline: 'user_average' }
          ],
          threshold: 2.5, // Standard deviations
          timeWindow: 3600000, // 1 hour
        },
        indicators: [
          { type: 'user', values: [], weight: 0.8 },
          { type: 'file', values: [], weight: 0.9 }
        ],
        mitre: {
          tactics: ['Collection', 'Exfiltration'],
          techniques: ['T1005', 'T1041'],
        },
        response: {
          automated: false,
          actions: ['alert', 'quarantine'],
          escalation: true,
        },
      },

      // Suspicious Command Execution
      {
        id: 'suspicious-commands',
        name: 'Suspicious Command Execution',
        description: 'Execution of potentially malicious commands',
        severity: 'medium',
        category: 'malware',
        patterns: {
          type: 'regex',
          rules: [
            { field: 'action', pattern: /(powershell|cmd|bash).*\s+(download|wget|curl|invoke-expression)/i },
            { field: 'details.metadata.command', pattern: /(base64|encoded|obfuscated)/i }
          ],
          threshold: 1,
        },
        indicators: [
          { type: 'command', values: ['powershell', 'cmd', 'bash'], weight: 0.7 },
          { type: 'behavior', values: ['command_execution'], weight: 0.8 }
        ],
        mitre: {
          tactics: ['Execution', 'Defense Evasion'],
          techniques: ['T1059', 'T1027'],
        },
        response: {
          automated: true,
          actions: ['alert', 'log'],
          escalation: false,
        },
      },

      // Anomalous Login Times
      {
        id: 'anomalous-login-time',
        name: 'Login Outside Normal Hours',
        description: 'User authentication outside their typical hours',
        severity: 'low',
        category: 'anomaly',
        patterns: {
          type: 'statistical',
          rules: [
            { field: 'eventType', value: 'authentication' },
            { field: 'outcome', value: 'success' },
            { field: 'timestamp', operator: 'time_anomaly', baseline: 'user_profile' }
          ],
          threshold: 0.1, // Probability threshold
        },
        indicators: [
          { type: 'user', values: [], weight: 0.6 },
          { type: 'behavior', values: ['time_anomaly'], weight: 0.5 }
        ],
        mitre: {
          tactics: ['Initial Access'],
          techniques: ['T1078'],
        },
        response: {
          automated: false,
          actions: ['alert'],
          escalation: false,
        },
      },
    ];

    for (const signature of signatures) {
      this.signatures.set(signature.id, signature);
    }

    this.logger.info(`Loaded ${signatures.length} threat signatures`);
  }

  /**
   * Load threat intelligence feeds
   */
  private loadThreatIntelligence(): void {
    // In production, this would load from external threat intel feeds
    const sampleIntel: ThreatIntelligence[] = [
      {
        id: 'malicious-ip-1',
        type: 'ioc',
        source: 'internal',
        confidence: 95,
        severity: 'high',
        indicators: [
          { type: 'ip', value: '192.168.1.100', context: 'Known malicious IP' }
        ],
        description: 'IP address associated with brute force attacks',
        firstSeen: Date.now() - (7 * 24 * 60 * 60 * 1000),
        lastSeen: Date.now() - (24 * 60 * 60 * 1000),
        tags: ['brute-force', 'malicious-ip'],
        references: ['internal-incident-001'],
      },
    ];

    for (const intel of sampleIntel) {
      this.threatIntel.set(intel.id, intel);
    }

    this.logger.info(`Loaded ${sampleIntel.length} threat intelligence indicators`);
  }

  /**
   * Load hunting queries
   */
  private loadHuntingQueries(): void {
    const queries: ThreatHuntingQuery[] = [
      {
        id: 'failed-logins-hunt',
        name: 'Hunt for Failed Login Patterns',
        description: 'Search for patterns of failed authentication attempts',
        query: 'eventType:authentication AND outcome:failure',
        language: 'elasticsearch',
        frequency: 'hourly',
        enabled: true,
        tags: ['authentication', 'brute-force'],
        author: 'security-team',
        created: Date.now(),
      },
      {
        id: 'privilege-escalation-hunt',
        name: 'Hunt for Privilege Escalation',
        description: 'Search for unauthorized privilege escalation attempts',
        query: 'action:*privilege* OR action:*admin* OR action:*sudo*',
        language: 'elasticsearch',
        frequency: 'daily',
        enabled: true,
        tags: ['privilege-escalation', 'admin'],
        author: 'security-team',
        created: Date.now(),
      },
      {
        id: 'data-exfiltration-hunt',
        name: 'Hunt for Data Exfiltration',
        description: 'Search for unusual data access patterns',
        query: 'eventType:data_access AND details.metadata.size:>10000000',
        language: 'elasticsearch',
        frequency: 'daily',
        enabled: true,
        tags: ['data-exfiltration', 'data-access'],
        author: 'security-team',
        created: Date.now(),
      },
    ];

    for (const query of queries) {
      this.huntingQueries.set(query.id, query);
    }

    this.logger.info(`Loaded ${queries.length} threat hunting queries`);
  }

  /**
   * Start threat detection engine
   */
  private startThreatDetection(): void {
    if (!this.config.realTimeMonitoring) {
      return;
    }

    // Process event buffer periodically
    setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.processBatchedEvents();
      }
    }, 10000); // Every 10 seconds

    // Run hunting queries periodically
    setInterval(async () => {
      await this.runScheduledHunting();
    }, 3600000); // Every hour

    // Update behavior profiles
    setInterval(async () => {
      await this.updateBehaviorProfiles();
    }, 300000); // Every 5 minutes

    this.logger.info('Threat detection engine started');
  }

  /**
   * Match event against threat signature
   */
  private async matchSignature(event: AuditEvent, signature: ThreatSignature): Promise<ThreatEvent | null> {
    const { patterns } = signature;

    switch (patterns.type) {
      case 'regex':
        return this.matchRegexPattern(event, signature);
      case 'frequency':
        return this.matchFrequencyPattern(event, signature);
      case 'sequence':
        return this.matchSequencePattern(event, signature);
      case 'statistical':
        return this.matchStatisticalPattern(event, signature);
      default:
        return null;
    }
  }

  /**
   * Match regex patterns
   */
  private async matchRegexPattern(event: AuditEvent, signature: ThreatSignature): Promise<ThreatEvent | null> {
    for (const rule of signature.patterns.rules) {
      const fieldValue = this.getFieldValue(event, rule.field);
      if (fieldValue && rule.pattern) {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(fieldValue)) {
          return this.createThreatEvent(event, signature, 0.8);
        }
      }
    }
    return null;
  }

  /**
   * Match frequency patterns
   */
  private async matchFrequencyPattern(event: AuditEvent, signature: ThreatSignature): Promise<ThreatEvent | null> {
    const timeWindow = signature.patterns.timeWindow || 300000; // 5 minutes default
    const threshold = signature.patterns.threshold;
    const windowStart = Date.now() - timeWindow;

    // Count matching events in time window
    const matchingEvents = this.eventBuffer.filter(e => {
      if (e.timestamp < windowStart) return false;
      
      return signature.patterns.rules.every(rule => {
        const eventValue = this.getFieldValue(e, rule.field);
        const targetValue = this.getFieldValue(event, rule.field);
        
        if (rule.operator === 'same') {
          return eventValue === targetValue;
        }
        return eventValue === rule.value;
      });
    });

    if (matchingEvents.length >= threshold) {
      return this.createThreatEvent(event, signature, 0.9, matchingEvents);
    }

    return null;
  }

  /**
   * Match sequence patterns
   */
  private async matchSequencePattern(event: AuditEvent, signature: ThreatSignature): Promise<ThreatEvent | null> {
    const timeWindow = signature.patterns.timeWindow || 600000; // 10 minutes default
    const windowStart = Date.now() - timeWindow;

    // Find events that match the sequence
    const sequenceEvents: AuditEvent[] = [];
    
    for (const rule of signature.patterns.rules) {
      const matchingEvent = this.eventBuffer.find(e => {
        if (e.timestamp < windowStart) return false;
        return this.getFieldValue(e, rule.field) === rule.value;
      });
      
      if (matchingEvent) {
        sequenceEvents.push(matchingEvent);
      }
    }

    if (sequenceEvents.length >= signature.patterns.threshold) {
      return this.createThreatEvent(event, signature, 0.85, sequenceEvents);
    }

    return null;
  }

  /**
   * Match statistical patterns (anomaly detection)
   */
  private async matchStatisticalPattern(event: AuditEvent, signature: ThreatSignature): Promise<ThreatEvent | null> {
    // This would implement statistical anomaly detection
    // For now, return null as it requires historical data analysis
    return null;
  }

  /**
   * Correlate with threat intelligence
   */
  private async correlateThreatIntelligence(event: AuditEvent): Promise<ThreatEvent[]> {
    const threats: ThreatEvent[] = [];

    for (const [intelId, intel] of this.threatIntel) {
      for (const indicator of intel.indicators) {
        const eventValue = this.extractIndicatorValue(event, indicator.type);
        
        if (eventValue && eventValue === indicator.value) {
          // Create threat signature from intelligence
          const signature: ThreatSignature = {
            id: `intel-${intelId}`,
            name: `Threat Intel Match: ${intel.description}`,
            description: intel.description,
            severity: intel.severity === 'info' ? 'low' : intel.severity,
            category: 'intrusion',
            patterns: { type: 'regex', rules: [], threshold: 1 },
            indicators: [{ type: indicator.type, values: [indicator.value], weight: 1.0 }],
            mitre: { tactics: [], techniques: [] },
            response: { automated: true, actions: ['alert'], escalation: true },
          };

          const threatEvent = this.createThreatEvent(event, signature, intel.confidence / 100);
          threatEvent.context.campaign = intel.tags.find(t => t.includes('campaign'));
          threats.push(threatEvent);
        }
      }
    }

    return threats;
  }

  /**
   * Analyze behavior for anomalies
   */
  private async analyzeBehavior(event: AuditEvent): Promise<ThreatEvent[]> {
    const threats: ThreatEvent[] = [];
    const actorId = event.actor.id;
    const profile = this.behaviorProfiles.get(actorId);

    if (!profile || !profile.learning.enabled) {
      return threats;
    }

    // Check for behavioral anomalies
    const anomalies = this.detectBehaviorAnomalies(event, profile);
    
    for (const anomaly of anomalies) {
      // Add anomaly to profile
      profile.current.anomalies.push({
        type: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        timestamp: Date.now(),
      });

      // Create threat event if significant
      if (anomaly.severity >= 0.7) {
        const signature: ThreatSignature = {
          id: `behavior-${anomaly.type}`,
          name: `Behavioral Anomaly: ${anomaly.type}`,
          description: anomaly.description,
          severity: anomaly.severity > 0.9 ? 'high' : 'medium',
          category: 'anomaly',
          patterns: { type: 'statistical', rules: [], threshold: 1 },
          indicators: [{ type: 'behavior', values: [anomaly.type], weight: anomaly.severity }],
          mitre: { tactics: ['Initial Access'], techniques: ['T1078'] },
          response: { automated: false, actions: ['alert'], escalation: false },
        };

        threats.push(this.createThreatEvent(event, signature, anomaly.severity));
      }
    }

    return threats;
  }

  /**
   * Run machine learning analysis
   */
  private async runMLAnalysis(event: AuditEvent): Promise<ThreatEvent[]> {
    // Placeholder for ML analysis
    // In production, this would use trained models for anomaly detection
    return [];
  }

  /**
   * Process threat event
   */
  private async processThreatEvent(threat: ThreatEvent): Promise<void> {
    this.threatEvents.push(threat);
    this.emit('threatDetected', threat);

    this.logger.warn(`Threat detected: ${threat.signature.name} (confidence: ${threat.confidence}%)`);

    // Execute automated response if enabled
    if (this.config.responseAutomation && threat.signature.response.automated) {
      await this.executeAutomatedResponse(threat);
    }

    // Check alert thresholds
    await this.checkAlertThresholds();
  }

  /**
   * Execute automated response
   */
  private async executeAutomatedResponse(threat: ThreatEvent): Promise<void> {
    const actions = threat.signature.response.actions;
    const executedActions: string[] = [];

    for (const action of actions) {
      try {
        switch (action) {
          case 'block':
            await this.blockEntity(threat.target);
            executedActions.push('block');
            break;
          case 'quarantine':
            await this.quarantineEntity(threat.target);
            executedActions.push('quarantine');
            break;
          case 'alert':
            await this.sendAlert(threat);
            executedActions.push('alert');
            break;
          case 'log':
            this.logger.info(`Threat logged: ${threat.signature.name}`);
            executedActions.push('log');
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to execute response action ${action}:`, error);
      }
    }

    threat.response = {
      automated: true,
      actions: executedActions,
      effectiveness: executedActions.length / actions.length * 100,
      timestamp: Date.now(),
    };
  }

  /**
   * Create threat event from detection
   */
  private createThreatEvent(
    triggerEvent: AuditEvent, 
    signature: ThreatSignature, 
    confidence: number,
    relatedEvents: AuditEvent[] = []
  ): ThreatEvent {
    return {
      id: this.generateThreatId(),
      timestamp: Date.now(),
      type: 'detection',
      signature,
      confidence: Math.round(confidence * 100),
      severity: signature.severity,
      source: 'threat-detection',
      target: {
        type: triggerEvent.actor.type,
        id: triggerEvent.actor.id,
        name: triggerEvent.actor.name,
        ip: triggerEvent.actor.ip,
      },
      evidence: {
        events: [triggerEvent, ...relatedEvents],
        artifacts: [],
        timeline: [{
          timestamp: triggerEvent.timestamp,
          description: `${signature.name} detected`,
        }],
        indicators: signature.indicators.map(ind => ({
          type: ind.type,
          value: ind.values.join(','),
          confidence: ind.weight,
        })),
      },
      context: {
        relatedThreats: [],
      },
      status: 'new',
      response: {
        automated: false,
        actions: [],
        effectiveness: 0,
        timestamp: 0,
      },
    };
  }

  /**
   * Helper functions
   */
  private getFieldValue(event: AuditEvent, field: string): any {
    const parts = field.split('.');
    let value: any = event;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }

  private extractIndicatorValue(event: AuditEvent, type: string): string | null {
    switch (type) {
      case 'ip':
        return event.actor.ip || null;
      case 'user':
        return event.actor.id;
      case 'file':
        return event.resource.type === 'file' ? event.resource.id : null;
      case 'command':
        return event.details.metadata.command || null;
      default:
        return null;
    }
  }

  private createNewBehaviorProfile(entityId: string, entityType: 'user' | 'system' | 'application'): BehaviorProfile {
    return {
      entityId,
      entityType,
      baseline: {
        loginTimes: [],
        locations: [],
        devices: [],
        activities: [],
        networkTraffic: [],
        accessPatterns: [],
      },
      current: {
        riskScore: 0,
        anomalies: [],
        lastUpdated: Date.now(),
      },
      learning: {
        enabled: true,
        samples: 0,
        confidence: 0,
        lastTrained: Date.now(),
      },
    };
  }

  private updateBaselineFromEvent(profile: BehaviorProfile, event: AuditEvent): void {
    // Update login times
    if (event.eventType === 'authentication' && event.outcome === 'success') {
      const hour = new Date(event.timestamp).getHours();
      if (!profile.baseline.loginTimes.includes(hour)) {
        profile.baseline.loginTimes.push(hour);
      }
    }

    // Update locations
    if (event.details.geolocation?.country) {
      const location = event.details.geolocation.country;
      if (!profile.baseline.locations.includes(location)) {
        profile.baseline.locations.push(location);
      }
    }

    // Update activities
    const activity = profile.baseline.activities.find(a => a.action === event.action);
    if (activity) {
      activity.frequency++;
    } else {
      profile.baseline.activities.push({ action: event.action, frequency: 1 });
    }
  }

  private async calculateRiskScore(profile: BehaviorProfile, events: AuditEvent[]): Promise<number> {
    let riskScore = 0;

    // Risk from anomalies
    const recentAnomalies = profile.current.anomalies.filter(
      a => a.timestamp > Date.now() - (24 * 60 * 60 * 1000)
    );
    riskScore += recentAnomalies.length * 10;

    // Risk from failed events
    const failedEvents = events.filter(e => e.outcome === 'failure');
    riskScore += (failedEvents.length / events.length) * 30;

    // Risk from privilege escalation attempts
    const privilegeEvents = events.filter(e => 
      e.action.includes('privilege') || e.action.includes('admin')
    );
    riskScore += privilegeEvents.length * 5;

    return Math.min(riskScore, 100);
  }

  private detectBehaviorAnomalies(event: AuditEvent, profile: BehaviorProfile): {
    type: string;
    severity: number;
    description: string;
  }[] {
    const anomalies: { type: string; severity: number; description: string }[] = [];

    // Check login time anomaly
    if (event.eventType === 'authentication') {
      const hour = new Date(event.timestamp).getHours();
      if (!profile.baseline.loginTimes.includes(hour)) {
        anomalies.push({
          type: 'unusual_login_time',
          severity: 0.6,
          description: `Login at unusual hour: ${hour}:00`,
        });
      }
    }

    // Check location anomaly
    if (event.details.geolocation?.country) {
      const location = event.details.geolocation.country;
      if (!profile.baseline.locations.includes(location)) {
        anomalies.push({
          type: 'new_location',
          severity: 0.8,
          description: `Login from new location: ${location}`,
        });
      }
    }

    // Check activity anomaly
    const activity = profile.baseline.activities.find(a => a.action === event.action);
    if (!activity && event.action.includes('admin')) {
      anomalies.push({
        type: 'new_admin_activity',
        severity: 0.9,
        description: `New administrative activity: ${event.action}`,
      });
    }

    return anomalies;
  }

  private async executeHuntingQuery(query: ThreatHuntingQuery): Promise<any[]> {
    // This would execute the hunting query against the data store
    // For now, return empty results
    return [];
  }

  private async createThreatFromHunt(query: ThreatHuntingQuery, results: any[]): Promise<void> {
    // Create threat events from hunting query results
    this.logger.info(`Hunting query ${query.name} found ${results.length} potential threats`);
  }

  private async processBatchedEvents(): Promise<void> {
    const events = [...this.eventBuffer];
    this.eventBuffer.length = 0;

    // Process events in batch for efficiency
    for (const event of events) {
      await this.analyzeEvent(event);
    }
  }

  private async runScheduledHunting(): Promise<void> {
    const now = Date.now();
    const queriesToRun = Array.from(this.huntingQueries.values()).filter(q => {
      if (!q.enabled) return false;
      
      const lastRun = q.lastRun || 0;
      const interval = this.getQueryInterval(q.frequency);
      
      return now - lastRun >= interval;
    });

    if (queriesToRun.length > 0) {
      await this.huntThreats();
    }
  }

  private async updateBehaviorProfiles(): Promise<void> {
    // Update behavior profiles with recent events
    for (const [entityId, profile] of this.behaviorProfiles) {
      const recentEvents = this.eventBuffer.filter(e => e.actor.id === entityId);
      if (recentEvents.length > 0) {
        await this.updateBehaviorProfile(entityId, profile.entityType, recentEvents);
      }
    }
  }

  private getQueryInterval(frequency: string): number {
    switch (frequency) {
      case 'continuous': return 0;
      case 'hourly': return 60 * 60 * 1000;
      case 'daily': return 24 * 60 * 60 * 1000;
      case 'weekly': return 7 * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  private async checkAlertThresholds(): Promise<void> {
    const thresholds = this.config.alertThresholds;
    const recentThreats = this.threatEvents.filter(t => 
      t.timestamp > Date.now() - (60 * 60 * 1000) // Last hour
    );

    const criticalCount = recentThreats.filter(t => t.severity === 'critical').length;
    const highCount = recentThreats.filter(t => t.severity === 'high').length;

    if (criticalCount >= thresholds.critical) {
      this.logger.error(`ALERT: ${criticalCount} critical threats detected in the last hour`);
    }

    if (highCount >= thresholds.high) {
      this.logger.warn(`ALERT: ${highCount} high-severity threats detected in the last hour`);
    }
  }

  private async blockEntity(target: ThreatEvent['target']): Promise<void> {
    this.logger.warn(`Blocking entity: ${target.type} ${target.id}`);
    // Implement blocking logic
  }

  private async quarantineEntity(target: ThreatEvent['target']): Promise<void> {
    this.logger.warn(`Quarantining entity: ${target.type} ${target.id}`);
    // Implement quarantine logic
  }

  private async sendAlert(threat: ThreatEvent): Promise<void> {
    this.logger.warn(`Sending alert for threat: ${threat.signature.name}`);
    // Implement alert sending logic
  }

  private generateThreatId(): string {
    return `threat_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}