/**
 * Alert Escalation Policies & Management
 * 
 * Manages alert escalation with configurable policies, time-based escalation,
 * on-call rotations, and automatic escalation based on severity and response times.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: EscalationRule[];
  conditions: {
    severities: string[];        // Which severities this policy applies to
    sources?: string[];          // Specific sources
    tags?: string[];             // Alert tags
    timeWindows?: TimeWindow[];  // Time-based conditions
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface EscalationRule {
  level: number;                 // Escalation level (1, 2, 3...)
  delayMinutes: number;         // Wait time before this level
  notificationChannels: string[]; // Channels to notify at this level
  recipients: Recipient[];      // Who to notify
  actions: EscalationAction[];  // Actions to take
  conditions?: {
    onlyIfNotAcknowledged?: boolean;
    onlyIfNotResolved?: boolean;
    requiresConfirmation?: boolean;
  };
}

export interface Recipient {
  type: 'user' | 'team' | 'role' | 'oncall';
  id: string;
  name: string;
  contact: {
    email?: string;
    phone?: string;
    slack?: string;
  };
  backup?: Recipient;           // Backup if primary unreachable
}

export interface EscalationAction {
  type: 'notify' | 'page' | 'ticket' | 'webhook' | 'escalate_externally';
  config: Record<string, any>;
  conditions?: string[];
}

export interface TimeWindow {
  start: string;                // HH:MM format
  end: string;                  // HH:MM format
  days: number[];               // 0=Sunday, 1=Monday, etc.
  timezone: string;
}

export interface OnCallSchedule {
  id: string;
  name: string;
  description: string;
  rotation: OnCallRotation;
  overrides: OnCallOverride[];
  escalationPolicyId?: string;
}

export interface OnCallRotation {
  type: 'daily' | 'weekly' | 'custom';
  duration: number;             // Duration in hours/days
  participants: Recipient[];
  startDate: Date;
  currentIndex: number;
}

export interface OnCallOverride {
  id: string;
  startTime: Date;
  endTime: Date;
  recipient: Recipient;
  reason: string;
}

export interface ActiveEscalation {
  id: string;
  alertId: string;
  policyId: string;
  currentLevel: number;
  startTime: Date;
  nextEscalationTime?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  escalationHistory: EscalationStep[];
}

export interface EscalationStep {
  level: number;
  timestamp: Date;
  recipients: string[];
  channels: string[];
  actions: string[];
  success: boolean;
  error?: string;
}

export class EscalationPolicies extends EventEmitter {
  private policies: Map<string, EscalationPolicy> = new Map();
  private onCallSchedules: Map<string, OnCallSchedule> = new Map();
  private activeEscalations: Map<string, ActiveEscalation> = new Map();
  
  private config = {
    checkInterval: 30000,         // Check escalations every 30 seconds
    maxEscalationLevel: 5,        // Maximum escalation levels
    defaultEscalationDelay: 15,   // Default delay in minutes
    acknowledgmentTimeout: 300,   // 5 minutes to acknowledge
  };

  private escalationTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultPolicies();
    this.initializeOnCallSchedules();
  }

  private initializeDefaultPolicies(): void {
    const defaultPolicies: EscalationPolicy[] = [
      {
        id: 'default_critical',
        name: 'Critical Alert Escalation',
        description: 'Standard escalation for critical alerts',
        enabled: true,
        rules: [
          {
            level: 1,
            delayMinutes: 0,
            notificationChannels: ['slack_alerts', 'email_oncall'],
            recipients: [
              {
                type: 'oncall',
                id: 'primary_oncall',
                name: 'Primary On-Call',
                contact: {
                  email: 'oncall@recoder.xyz',
                  slack: '@oncall'
                }
              }
            ],
            actions: [
              {
                type: 'notify',
                config: {
                  urgency: 'high',
                  method: ['email', 'slack']
                }
              }
            ],
            conditions: {
              onlyIfNotAcknowledged: true
            }
          },
          {
            level: 2,
            delayMinutes: 15,
            notificationChannels: ['slack_alerts', 'email_oncall'],
            recipients: [
              {
                type: 'team',
                id: 'sre_team',
                name: 'SRE Team',
                contact: {
                  email: 'sre@recoder.xyz',
                  slack: '@sre-team'
                }
              }
            ],
            actions: [
              {
                type: 'page',
                config: {
                  service: 'pagerduty',
                  urgency: 'high'
                }
              }
            ],
            conditions: {
              onlyIfNotAcknowledged: true,
              onlyIfNotResolved: true
            }
          },
          {
            level: 3,
            delayMinutes: 30,
            notificationChannels: ['email_oncall'],
            recipients: [
              {
                type: 'role',
                id: 'engineering_manager',
                name: 'Engineering Manager',
                contact: {
                  email: 'manager@recoder.xyz'
                }
              }
            ],
            actions: [
              {
                type: 'escalate_externally',
                config: {
                  service: 'incident_management',
                  severity: 'critical'
                }
              }
            ],
            conditions: {
              onlyIfNotAcknowledged: true,
              onlyIfNotResolved: true
            }
          }
        ],
        conditions: {
          severities: ['critical']
        },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'default_high',
        name: 'High Priority Escalation',
        description: 'Standard escalation for high priority alerts',
        enabled: true,
        rules: [
          {
            level: 1,
            delayMinutes: 0,
            notificationChannels: ['slack_alerts'],
            recipients: [
              {
                type: 'oncall',
                id: 'primary_oncall',
                name: 'Primary On-Call',
                contact: {
                  slack: '@oncall'
                }
              }
            ],
            actions: [
              {
                type: 'notify',
                config: {
                  urgency: 'medium'
                }
              }
            ]
          },
          {
            level: 2,
            delayMinutes: 30,
            notificationChannels: ['email_oncall'],
            recipients: [
              {
                type: 'team',
                id: 'sre_team',
                name: 'SRE Team',
                contact: {
                  email: 'sre@recoder.xyz'
                }
              }
            ],
            actions: [
              {
                type: 'notify',
                config: {
                  urgency: 'medium'
                }
              }
            ],
            conditions: {
              onlyIfNotAcknowledged: true
            }
          }
        ],
        conditions: {
          severities: ['high']
        },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'default_budget',
        name: 'Budget Alert Escalation',
        description: 'Escalation for budget and cost alerts',
        enabled: true,
        rules: [
          {
            level: 1,
            delayMinutes: 0,
            notificationChannels: ['email_billing'],
            recipients: [
              {
                type: 'team',
                id: 'billing_team',
                name: 'Billing Team',
                contact: {
                  email: 'billing@recoder.xyz'
                }
              }
            ],
            actions: [
              {
                type: 'notify',
                config: {
                  urgency: 'medium'
                }
              }
            ]
          },
          {
            level: 2,
            delayMinutes: 60,
            notificationChannels: ['email_oncall'],
            recipients: [
              {
                type: 'role',
                id: 'finance_manager',
                name: 'Finance Manager',
                contact: {
                  email: 'finance@recoder.xyz'
                }
              }
            ],
            actions: [
              {
                type: 'ticket',
                config: {
                  system: 'jira',
                  project: 'BILLING',
                  priority: 'high'
                }
              }
            ],
            conditions: {
              onlyIfNotAcknowledged: true
            }
          }
        ],
        conditions: {
          severities: ['high', 'critical'],
          tags: ['budget', 'cost']
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });

    Logger.info(`Initialized ${defaultPolicies.length} default escalation policies`);
  }

  private initializeOnCallSchedules(): void {
    const defaultSchedules: OnCallSchedule[] = [
      {
        id: 'primary_oncall',
        name: 'Primary On-Call Rotation',
        description: 'Primary on-call rotation for critical alerts',
        rotation: {
          type: 'weekly',
          duration: 168, // 1 week in hours
          participants: [
            {
              type: 'user',
              id: 'user1',
              name: 'Alice Smith',
              contact: {
                email: 'alice@recoder.xyz',
                phone: '+1234567890',
                slack: '@alice'
              }
            },
            {
              type: 'user',
              id: 'user2',
              name: 'Bob Johnson',
              contact: {
                email: 'bob@recoder.xyz',
                phone: '+1234567891',
                slack: '@bob'
              }
            },
            {
              type: 'user',
              id: 'user3',
              name: 'Carol Williams',
              contact: {
                email: 'carol@recoder.xyz',
                phone: '+1234567892',
                slack: '@carol'
              }
            }
          ],
          startDate: new Date('2024-01-01T00:00:00Z'),
          currentIndex: 0
        },
        overrides: [],
        escalationPolicyId: 'default_critical'
      }
    ];

    defaultSchedules.forEach(schedule => {
      this.onCallSchedules.set(schedule.id, schedule);
    });

    Logger.info(`Initialized ${defaultSchedules.length} on-call schedules`);
  }

  /**
   * Start escalation policy management
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Escalation policies are already running');
      return;
    }

    Logger.info('Starting escalation policy management...');

    // Start escalation check timer
    this.escalationTimer = setInterval(() => {
      this.processEscalations();
    }, this.config.checkInterval);

    this.isRunning = true;
    this.emit('escalationStarted');

    Logger.info('Escalation policy management started successfully');
  }

  /**
   * Stop escalation policy management
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping escalation policy management...');

    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
      this.escalationTimer = null;
    }

    this.isRunning = false;
    this.emit('escalationStopped');

    Logger.info('Escalation policy management stopped');
  }

  /**
   * Start escalation for an alert
   */
  async startEscalation(alertId: string, policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy || !policy.enabled) {
      Logger.warn(`Escalation policy ${policyId} not found or disabled`);
      return;
    }

    // Check if escalation already exists
    if (this.activeEscalations.has(alertId)) {
      Logger.debug(`Escalation already active for alert ${alertId}`);
      return;
    }

    const escalation: ActiveEscalation = {
      id: `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      alertId,
      policyId,
      currentLevel: 0,
      startTime: new Date(),
      acknowledged: false,
      escalationHistory: []
    };

    this.activeEscalations.set(alertId, escalation);

    // Start with level 1 immediately
    await this.executeEscalationLevel(escalation, 1);

    this.emit('escalationStarted', escalation);
    Logger.info(`Started escalation for alert ${alertId} with policy ${policyId}`);
  }

  /**
   * Stop escalation for an alert
   */
  async stopEscalation(alertId: string): Promise<void> {
    const escalation = this.activeEscalations.get(alertId);
    if (!escalation) {
      return;
    }

    this.activeEscalations.delete(alertId);
    
    this.emit('escalationStopped', escalation);
    Logger.info(`Stopped escalation for alert ${alertId}`);
  }

  /**
   * Check and process due escalations
   */
  async checkEscalation(alertId: string): Promise<void> {
    const escalation = this.activeEscalations.get(alertId);
    if (!escalation || escalation.acknowledged) {
      return;
    }

    const now = new Date();
    
    // Check if it's time for next escalation level
    if (escalation.nextEscalationTime && now >= escalation.nextEscalationTime) {
      const policy = this.policies.get(escalation.policyId);
      if (!policy) return;

      const nextLevel = escalation.currentLevel + 1;
      const nextRule = policy.rules.find(rule => rule.level === nextLevel);
      
      if (nextRule) {
        await this.executeEscalationLevel(escalation, nextLevel);
      }
    }
  }

  /**
   * Acknowledge an escalation
   */
  async acknowledgeEscalation(alertId: string, acknowledgedBy: string): Promise<void> {
    const escalation = this.activeEscalations.get(alertId);
    if (!escalation) {
      return;
    }

    escalation.acknowledged = true;
    escalation.acknowledgedBy = acknowledgedBy;
    escalation.acknowledgedAt = new Date();

    this.emit('escalationAcknowledged', escalation);
    Logger.info(`Escalation acknowledged for alert ${alertId} by ${acknowledgedBy}`);
  }

  /**
   * Get current on-call person for a schedule
   */
  getCurrentOnCall(scheduleId: string): Recipient | null {
    const schedule = this.onCallSchedules.get(scheduleId);
    if (!schedule) {
      return null;
    }

    // Check for active overrides first
    const now = new Date();
    const activeOverride = schedule.overrides.find(
      override => now >= override.startTime && now <= override.endTime
    );

    if (activeOverride) {
      return activeOverride.recipient;
    }

    // Calculate current person in rotation
    const rotation = schedule.rotation;
    const timeSinceStart = now.getTime() - rotation.startDate.getTime();
    const rotationDurationMs = rotation.duration * 60 * 60 * 1000; // Convert hours to ms
    
    const cyclesSinceStart = Math.floor(timeSinceStart / rotationDurationMs);
    const currentIndex = cyclesSinceStart % rotation.participants.length;
    
    return rotation.participants[currentIndex];
  }

  /**
   * Add or update escalation policy
   */
  async setEscalationPolicy(policy: EscalationPolicy): Promise<void> {
    this.policies.set(policy.id, { ...policy, updatedAt: new Date() });
    Logger.info(`${this.policies.has(policy.id) ? 'Updated' : 'Created'} escalation policy: ${policy.name}`);
  }

  /**
   * Get all escalation policies
   */
  getEscalationPolicies(): EscalationPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get active escalations
   */
  getActiveEscalations(): ActiveEscalation[] {
    return Array.from(this.activeEscalations.values());
  }

  /**
   * Add or update on-call schedule
   */
  async setOnCallSchedule(schedule: OnCallSchedule): Promise<void> {
    this.onCallSchedules.set(schedule.id, schedule);
    Logger.info(`${this.onCallSchedules.has(schedule.id) ? 'Updated' : 'Created'} on-call schedule: ${schedule.name}`);
  }

  /**
   * Get all on-call schedules
   */
  getOnCallSchedules(): OnCallSchedule[] {
    return Array.from(this.onCallSchedules.values());
  }

  /**
   * Add on-call override
   */
  async addOnCallOverride(
    scheduleId: string,
    override: Omit<OnCallOverride, 'id'>
  ): Promise<string> {
    const schedule = this.onCallSchedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    const overrideWithId: OnCallOverride = {
      id: `override_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...override
    };

    schedule.overrides.push(overrideWithId);
    
    Logger.info(`Added on-call override for schedule ${scheduleId}: ${override.reason}`);
    return overrideWithId.id;
  }

  // Private helper methods

  private async processEscalations(): Promise<void> {
    for (const escalation of this.activeEscalations.values()) {
      if (!escalation.acknowledged) {
        await this.checkEscalation(escalation.alertId);
      }
    }
  }

  private async executeEscalationLevel(escalation: ActiveEscalation, level: number): Promise<void> {
    const policy = this.policies.get(escalation.policyId);
    if (!policy) return;

    const rule = policy.rules.find(r => r.level === level);
    if (!rule) return;

    // Check rule conditions
    if (rule.conditions?.onlyIfNotAcknowledged && escalation.acknowledged) {
      return;
    }

    escalation.currentLevel = level;

    const step: EscalationStep = {
      level,
      timestamp: new Date(),
      recipients: rule.recipients.map(r => r.name),
      channels: rule.notificationChannels,
      actions: rule.actions.map(a => a.type),
      success: false
    };

    try {
      // Execute notifications
      await this.executeNotifications(rule, escalation.alertId);

      // Execute actions
      await this.executeActions(rule.actions, escalation.alertId);

      step.success = true;

      // Schedule next escalation level
      const nextRule = policy.rules.find(r => r.level === level + 1);
      if (nextRule) {
        escalation.nextEscalationTime = new Date(
          Date.now() + nextRule.delayMinutes * 60 * 1000
        );
      }

    } catch (error) {
      step.error = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`Escalation level ${level} failed for alert ${escalation.alertId}:`, error);
    }

    escalation.escalationHistory.push(step);
    
    this.emit('escalationLevelExecuted', escalation, level, step.success);
    Logger.info(`Executed escalation level ${level} for alert ${escalation.alertId}`);
  }

  private async executeNotifications(rule: EscalationRule, alertId: string): Promise<void> {
    // Resolve actual recipients
    const recipients = await this.resolveRecipients(rule.recipients);
    
    // This would integrate with the notification service
    Logger.info(`Would notify ${recipients.length} recipients for alert ${alertId}`);
    
    // Simulate notification success
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async executeActions(actions: EscalationAction[], alertId: string): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'page':
            await this.executePagingAction(action, alertId);
            break;
          case 'ticket':
            await this.executeTicketAction(action, alertId);
            break;
          case 'webhook':
            await this.executeWebhookAction(action, alertId);
            break;
          case 'escalate_externally':
            await this.executeExternalEscalation(action, alertId);
            break;
          default:
            Logger.debug(`Unknown action type: ${action.type}`);
        }
      } catch (error) {
        Logger.error(`Failed to execute action ${action.type} for alert ${alertId}:`, error);
      }
    }
  }

  private async resolveRecipients(recipients: Recipient[]): Promise<Recipient[]> {
    const resolved: Recipient[] = [];

    for (const recipient of recipients) {
      if (recipient.type === 'oncall') {
        const onCallPerson = this.getCurrentOnCall(recipient.id);
        if (onCallPerson) {
          resolved.push(onCallPerson);
        }
      } else {
        resolved.push(recipient);
      }
    }

    return resolved;
  }

  private async executePagingAction(action: EscalationAction, alertId: string): Promise<void> {
    Logger.info(`Would send page for alert ${alertId} via ${action.config.service}`);
  }

  private async executeTicketAction(action: EscalationAction, alertId: string): Promise<void> {
    Logger.info(`Would create ticket for alert ${alertId} in ${action.config.system}`);
  }

  private async executeWebhookAction(action: EscalationAction, alertId: string): Promise<void> {
    Logger.info(`Would call webhook for alert ${alertId}`);
  }

  private async executeExternalEscalation(action: EscalationAction, alertId: string): Promise<void> {
    Logger.info(`Would escalate externally for alert ${alertId} to ${action.config.service}`);
  }
}

// Export singleton instance
export const escalationPolicies = new EscalationPolicies();