/**
 * Project types and interfaces
 */

import { Timestamp, ProjectType, Environment, IntegrationType, RealityCheckConfig } from './common';

export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  GENERATING = 'generating',
  VALIDATING = 'validating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ARCHIVED = 'archived'
}

export enum ProjectVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public'
}

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  configuration: ProjectConfiguration;
  plan: ProjectPlan;
  structure: ProjectStructure;
  dependencies: ProjectDependencies;
  integrations: ProjectIntegration[];
  validation: ProjectValidation;
  deployment: DeploymentConfig;
  collaboration: ProjectCollaboration;
  metrics: ProjectMetrics;
  createdBy: string;
  teamMembers: string[];
  tags: string[];
  version: string;
  repositoryUrl?: string;
  timestamps: Timestamp;
}

export interface ProjectConfiguration {
  language: string;
  framework: string;
  targetEnvironment: Environment;
  qualityLevel: 'prototype' | 'production' | 'enterprise';
  realityCheck: RealityCheckConfig;
  buildTools: string[];
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  nodeVersion?: string;
  pythonVersion?: string;
  dockerSupport: boolean;
  cicdPipeline: boolean;
}

export interface ProjectPlan {
  requirements: Requirements;
  architecture: Architecture;
  timeline: Timeline;
  resources: ResourcePlanning;
  riskAssessment: RiskAssessment;
  qualityGates: QualityGate[];
}

export interface Requirements {
  functional: FunctionalRequirement[];
  nonFunctional: NonFunctionalRequirement[];
  business: BusinessRequirement[];
  technical: TechnicalRequirement[];
  security: SecurityRequirement[];
  compliance: ComplianceRequirement[];
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  userStory: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  estimatedHours: number;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
}

export interface NonFunctionalRequirement {
  id: string;
  category: 'performance' | 'scalability' | 'security' | 'usability' | 'reliability' | 'maintainability';
  requirement: string;
  metric: string;
  targetValue: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  validationMethod: string;
}

export interface BusinessRequirement {
  id: string;
  stakeholder: string;
  requirement: string;
  businessValue: string;
  successCriteria: string[];
  constraints: string[];
}

export interface TechnicalRequirement {
  id: string;
  category: 'infrastructure' | 'integration' | 'data' | 'security' | 'performance';
  requirement: string;
  specification: string;
  constraints: string[];
  dependencies: string[];
}

export interface SecurityRequirement {
  id: string;
  type: 'authentication' | 'authorization' | 'encryption' | 'data-protection' | 'audit' | 'compliance';
  requirement: string;
  implementation: string;
  validationMethod: string;
  complianceStandards: string[];
}

export interface ComplianceRequirement {
  id: string;
  standard: string; // GDPR, HIPAA, SOX, PCI-DSS, etc.
  requirement: string;
  implementation: string;
  evidence: string[];
  auditTrail: boolean;
}

export interface Architecture {
  pattern: 'monolithic' | 'microservices' | 'serverless' | 'jamstack' | 'spa' | 'ssr';
  components: ArchitectureComponent[];
  dataFlow: DataFlow[];
  integrationPoints: IntegrationPoint[];
  scalabilityStrategy: ScalabilityStrategy;
  securityModel: SecurityModel;
  monitoringStrategy: MonitoringStrategy;
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'storage' | 'cdn' | 'auth';
  technology: string;
  responsibilities: string[];
  interfaces: ComponentInterface[];
  dependencies: string[];
  scalingStrategy: string;
  monitoringRequirements: string[];
}

export interface ComponentInterface {
  name: string;
  type: 'rest' | 'graphql' | 'grpc' | 'websocket' | 'message-queue' | 'database';
  specification: string;
  authentication: boolean;
  rateLimit?: number;
  caching?: boolean;
}

export interface DataFlow {
  from: string;
  to: string;
  dataType: string;
  volume: 'low' | 'medium' | 'high' | 'extreme';
  frequency: string;
  security: 'none' | 'encrypted' | 'authenticated' | 'both';
  backup: boolean;
}

export interface IntegrationPoint {
  id: string;
  type: IntegrationType;
  provider: string;
  service: string;
  authentication: string;
  configuration: Record<string, any>;
  realImplementation: boolean;
  fallbackStrategy: string;
  monitoringEndpoints: string[];
}

export interface ScalabilityStrategy {
  horizontal: boolean;
  vertical: boolean;
  autoScaling: boolean;
  loadBalancing: string;
  cachingStrategy: string;
  cdnStrategy: string;
  databaseScaling: string;
}

export interface SecurityModel {
  authentication: string;
  authorization: string;
  encryption: EncryptionConfig;
  dataProtection: DataProtectionConfig;
  auditLogging: boolean;
  threatModel: string[];
}

export interface EncryptionConfig {
  inTransit: boolean;
  atRest: boolean;
  keyManagement: string;
  algorithms: string[];
}

export interface DataProtectionConfig {
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  retention: string;
  anonymization: boolean;
  backupEncryption: boolean;
}

export interface MonitoringStrategy {
  metrics: string[];
  logging: LoggingConfig;
  alerting: AlertingConfig;
  tracing: boolean;
  healthChecks: string[];
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  structured: boolean;
  retention: string;
  aggregation: boolean;
}

export interface AlertingConfig {
  channels: string[];
  severityLevels: string[];
  escalationRules: string[];
  silencingRules: string[];
}

export interface Timeline {
  phases: ProjectPhase[];
  milestones: Milestone[];
  dependencies: PhaseDependency[];
  estimatedDuration: string;
  bufferTime: string;
  deliveryDate: string;
}

export interface ProjectPhase {
  id: string;
  name: string;
  description: string;
  duration: string;
  startDate: string;
  endDate: string;
  deliverables: string[];
  resources: string[];
  dependencies: string[];
  status: 'not-started' | 'in-progress' | 'completed' | 'blocked' | 'delayed';
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  dueDate: string;
  criteria: string[];
  dependencies: string[];
  status: 'pending' | 'achieved' | 'missed' | 'at-risk';
}

export interface PhaseDependency {
  from: string;
  to: string;
  type: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  lag: string;
}

export interface ResourcePlanning {
  roles: RoleRequirement[];
  skills: SkillRequirement[];
  tools: ToolRequirement[];
  infrastructure: InfrastructureRequirement[];
  budget: BudgetEstimate;
}

export interface RoleRequirement {
  role: string;
  count: number;
  duration: string;
  skills: string[];
  level: 'junior' | 'mid' | 'senior' | 'lead';
}

export interface SkillRequirement {
  skill: string;
  level: 'basic' | 'intermediate' | 'advanced' | 'expert';
  critical: boolean;
  alternatives: string[];
}

export interface ToolRequirement {
  name: string;
  type: 'development' | 'testing' | 'deployment' | 'monitoring' | 'collaboration';
  cost: 'free' | 'paid' | 'enterprise';
  license: string;
  alternatives: string[];
}

export interface InfrastructureRequirement {
  component: string;
  specification: string;
  environment: Environment;
  cost: string;
  scaling: 'fixed' | 'dynamic';
}

export interface BudgetEstimate {
  development: number;
  infrastructure: number;
  tools: number;
  thirdParty: number;
  maintenance: number;
  total: number;
  currency: string;
}

export interface RiskAssessment {
  risks: ProjectRisk[];
  mitigationStrategies: MitigationStrategy[];
  contingencyPlans: ContingencyPlan[];
  riskScore: number;
}

export interface ProjectRisk {
  id: string;
  category: 'technical' | 'business' | 'operational' | 'external' | 'security';
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  owner: string;
  status: 'open' | 'mitigated' | 'accepted' | 'transferred' | 'closed';
}

export interface MitigationStrategy {
  riskId: string;
  strategy: string;
  actions: string[];
  owner: string;
  timeline: string;
  cost: number;
  effectiveness: number;
}

export interface ContingencyPlan {
  trigger: string;
  actions: string[];
  resources: string[];
  timeline: string;
  approvalRequired: boolean;
}

export interface QualityGate {
  id: string;
  name: string;
  phase: string;
  criteria: QualityCriterion[];
  automatedChecks: string[];
  manualReviews: string[];
  exitCriteria: string[];
}

export interface QualityCriterion {
  metric: string;
  threshold: string;
  measurement: string;
  critical: boolean;
}

export interface ProjectStructure {
  directories: DirectoryStructure[];
  files: FileStructure[];
  conventions: NamingConvention[];
  patterns: StructurePattern[];
}

export interface DirectoryStructure {
  path: string;
  purpose: string;
  contents: string[];
  permissions: string;
  gitIgnore: boolean;
}

export interface FileStructure {
  path: string;
  type: string;
  template: string;
  generated: boolean;
  critical: boolean;
}

export interface NamingConvention {
  type: 'file' | 'directory' | 'variable' | 'function' | 'class' | 'constant';
  pattern: string;
  description: string;
  examples: string[];
}

export interface StructurePattern {
  name: string;
  description: string;
  structure: string[];
  benefits: string[];
  constraints: string[];
}

export interface ProjectDependencies {
  runtime: Dependency[];
  development: Dependency[];
  peer: Dependency[];
  optional: Dependency[];
  security: SecurityDependency[];
  licensing: LicensingInfo[];
}

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  source: string;
  purpose: string;
  alternatives: string[];
  critical: boolean;
  vulnerabilities: Vulnerability[];
}

export interface SecurityDependency {
  name: string;
  version: string;
  vulnerabilities: Vulnerability[];
  securityRating: 'low' | 'medium' | 'high' | 'critical';
  lastAudit: string;
  mitigations: string[];
}

export interface Vulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  cwe: string;
  cvss: number;
  fixedIn?: string;
  workaround?: string;
}

export interface LicensingInfo {
  dependency: string;
  license: string;
  compatible: boolean;
  restrictions: string[];
  attribution: boolean;
}

export interface ProjectIntegration {
  id: string;
  type: IntegrationType;
  provider: string;
  service: string;
  configuration: IntegrationConfiguration;
  authentication: AuthenticationConfig;
  validation: IntegrationValidation;
  monitoring: IntegrationMonitoring;
  fallback: FallbackConfig;
}

export interface IntegrationConfiguration {
  endpoint: string;
  version: string;
  environment: Environment;
  parameters: Record<string, any>;
  headers: Record<string, string>;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface AuthenticationConfig {
  type: 'none' | 'api-key' | 'oauth' | 'jwt' | 'certificate' | 'basic';
  credentials: string; // encrypted
  refreshable: boolean;
  expiration?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  retryOn: string[];
}

export interface IntegrationValidation {
  healthCheck: string;
  testCases: IntegrationTestCase[];
  lastValidation: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  responseTime: number;
}

export interface IntegrationTestCase {
  name: string;
  request: any;
  expectedResponse: any;
  validations: string[];
  critical: boolean;
}

export interface IntegrationMonitoring {
  metrics: string[];
  alerts: string[];
  dashboards: string[];
  logging: boolean;
  tracing: boolean;
}

export interface FallbackConfig {
  enabled: boolean;
  strategy: 'circuit-breaker' | 'cache' | 'alternative-service' | 'degraded-mode';
  configuration: Record<string, any>;
  testScenarios: string[];
}

export interface ProjectValidation {
  status: 'pending' | 'in-progress' | 'passed' | 'failed' | 'warning';
  checks: ValidationCheck[];
  realityChecks: RealityCheck[];
  securityChecks: SecurityCheck[];
  performanceChecks: PerformanceCheck[];
  lastValidation: string;
  score: number;
}

export interface ValidationCheck {
  id: string;
  name: string;
  category: 'syntax' | 'semantic' | 'security' | 'performance' | 'best-practices' | 'reality';
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  file?: string;
  line?: number;
  column?: number;
  fix?: string;
}

export interface RealityCheck {
  id: string;
  name: string;
  description: string;
  category: 'integration' | 'dependency' | 'configuration' | 'data' | 'security';
  result: 'real' | 'mock' | 'placeholder' | 'incomplete';
  evidence: string[];
  recommendations: string[];
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityCheck {
  id: string;
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  file: string;
  line: number;
  evidence: string;
  remediation: string;
  cwe?: string;
  owasp?: string;
}

export interface PerformanceCheck {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  status: 'passed' | 'warning' | 'failed';
  impact: string;
  recommendations: string[];
}

export interface DeploymentConfig {
  strategy: 'manual' | 'ci-cd' | 'gitops';
  environments: EnvironmentConfig[];
  pipeline: PipelineStage[];
  rollback: RollbackConfig;
  monitoring: DeploymentMonitoring;
}

export interface EnvironmentConfig {
  name: Environment;
  url?: string;
  variables: Record<string, string>;
  secrets: string[];
  infrastructure: InfrastructureConfig;
  scaling: ScalingConfig;
}

export interface InfrastructureConfig {
  provider: string;
  region: string;
  instances: InstanceConfig[];
  networking: NetworkConfig;
  storage: StorageConfig;
  monitoring: boolean;
}

export interface InstanceConfig {
  type: string;
  count: number;
  cpu: string;
  memory: string;
  storage: string;
  os: string;
}

export interface NetworkConfig {
  vpc: string;
  subnets: string[];
  loadBalancer: boolean;
  cdn: boolean;
  ssl: boolean;
}

export interface StorageConfig {
  databases: DatabaseConfig[];
  fileStorage: FileStorageConfig[];
  cache: CacheConfig[];
}

export interface DatabaseConfig {
  type: string;
  size: string;
  backup: boolean;
  encryption: boolean;
  multiAz: boolean;
}

export interface FileStorageConfig {
  type: string;
  size: string;
  backup: boolean;
  encryption: boolean;
  cdn: boolean;
}

export interface CacheConfig {
  type: string;
  size: string;
  replication: boolean;
  persistence: boolean;
}

export interface ScalingConfig {
  autoScaling: boolean;
  minInstances: number;
  maxInstances: number;
  targetCpu: number;
  targetMemory: number;
  scaleUpPolicy: string;
  scaleDownPolicy: string;
}

export interface PipelineStage {
  name: string;
  type: 'build' | 'test' | 'security-scan' | 'deploy' | 'verify';
  commands: string[];
  environment: Record<string, string>;
  artifacts: string[];
  parallelizable: boolean;
  timeout: number;
  retryPolicy: RetryPolicy;
  approvalRequired: boolean;
}

export interface RollbackConfig {
  strategy: 'immediate' | 'gradual' | 'manual';
  triggers: string[];
  maxRollbacks: number;
  dataBackup: boolean;
  notifications: string[];
}

export interface DeploymentMonitoring {
  healthChecks: string[];
  metrics: string[];
  alerts: string[];
  canaryAnalysis: boolean;
  rollbackTriggers: string[];
}

export interface ProjectCollaboration {
  team: TeamMember[];
  permissions: ProjectPermission[];
  workflows: WorkflowConfig[];
  communications: CommunicationConfig;
}

export interface TeamMember {
  userId: string;
  role: 'owner' | 'admin' | 'developer' | 'reviewer' | 'viewer';
  permissions: string[];
  joinedAt: string;
  lastActivity: string;
}

export interface ProjectPermission {
  resource: string;
  actions: string[];
  roles: string[];
  conditions: string[];
}

export interface WorkflowConfig {
  name: string;
  triggers: string[];
  steps: WorkflowStep[];
  notifications: string[];
  approval: ApprovalConfig;
}

export interface WorkflowStep {
  name: string;
  type: 'automated' | 'manual' | 'approval';
  action: string;
  conditions: string[];
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface ApprovalConfig {
  required: boolean;
  approvers: string[];
  minApprovals: number;
  timeout: number;
  autoApprove: string[];
}

export interface CommunicationConfig {
  channels: CommunicationChannel[];
  notifications: NotificationRule[];
  integrations: string[];
}

export interface CommunicationChannel {
  type: 'slack' | 'teams' | 'discord' | 'email' | 'webhook';
  configuration: Record<string, any>;
  events: string[];
  active: boolean;
}

export interface NotificationRule {
  event: string;
  channels: string[];
  recipients: string[];
  template: string;
  conditions: string[];
}

export interface ProjectMetrics {
  progress: ProgressMetrics;
  quality: QualityMetrics;
  performance: PerformanceMetrics;
  collaboration: CollaborationMetrics;
  deployment: DeploymentMetrics;
}

export interface ProgressMetrics {
  completedRequirements: number;
  totalRequirements: number;
  completedTasks: number;
  totalTasks: number;
  milestonesAchieved: number;
  totalMilestones: number;
  burndownRate: number;
  velocityTrend: number[];
}

export interface QualityMetrics {
  codeQuality: number;
  testCoverage: number;
  bugDensity: number;
  technicalDebt: number;
  securityScore: number;
  performanceScore: number;
  maintainabilityIndex: number;
}

export interface PerformanceMetrics {
  buildTime: number;
  deploymentTime: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
}

export interface CollaborationMetrics {
  teamVelocity: number;
  communicationFrequency: number;
  knowledgeSharing: number;
  conflictResolution: number;
  memberSatisfaction: number;
}

export interface DeploymentMetrics {
  frequency: number;
  successRate: number;
  rollbackRate: number;
  leadTime: number;
  recoveryTime: number;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  configuration: Partial<ProjectConfiguration>;
  requirements?: Partial<Requirements>;
  teamMembers?: string[];
  tags?: string[];
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  configuration?: Partial<ProjectConfiguration>;
  plan?: Partial<ProjectPlan>;
  teamMembers?: string[];
  tags?: string[];
}