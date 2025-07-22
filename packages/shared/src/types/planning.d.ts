/**
 * Planning types and interfaces for project requirements, architecture, and validation
 */
import { ProjectType, Environment, RealityCheckConfig } from './common';
export declare enum PlanningPhase {
    DISCOVERY = "discovery",
    REQUIREMENTS = "requirements",
    ARCHITECTURE = "architecture",
    DESIGN = "design",
    VALIDATION = "validation",
    APPROVAL = "approval",
    IMPLEMENTATION = "implementation"
}
export declare enum RequirementType {
    FUNCTIONAL = "functional",
    NON_FUNCTIONAL = "non_functional",
    BUSINESS = "business",
    TECHNICAL = "technical",
    SECURITY = "security",
    COMPLIANCE = "compliance",
    INTEGRATION = "integration",
    DATA = "data"
}
export declare enum ArchitecturePattern {
    MONOLITHIC = "monolithic",
    MICROSERVICES = "microservices",
    SERVERLESS = "serverless",
    EVENT_DRIVEN = "event_driven",
    LAYERED = "layered",
    HEXAGONAL = "hexagonal",
    CQRS = "cqrs",
    EVENT_SOURCING = "event_sourcing",
    JAMSTACK = "jamstack",
    SPA = "spa",
    SSR = "ssr",
    HYBRID = "hybrid"
}
export interface PlanningRequest {
    projectId?: string;
    description: string;
    type: ProjectType;
    scope: ProjectScope;
    constraints: PlanningConstraints;
    preferences: PlanningPreferences;
    context: PlanningContext;
    stakeholders: Stakeholder[];
    timeline: TimelineRequirement;
    budget: BudgetConstraint;
    quality: QualityRequirement;
    realityCheck: RealityCheckConfig;
}
export interface ProjectScope {
    overview: string;
    goals: string[];
    objectives: string[];
    deliverables: string[];
    exclusions: string[];
    assumptions: string[];
    dependencies: string[];
    risks: string[];
    successCriteria: string[];
}
export interface PlanningConstraints {
    technical: TechnicalConstraint[];
    business: BusinessConstraint[];
    regulatory: RegulatoryConstraint[];
    resource: ResourceConstraint[];
    integration: IntegrationConstraint[];
}
export interface TechnicalConstraint {
    type: 'language' | 'framework' | 'platform' | 'database' | 'cloud' | 'security' | 'performance';
    requirement: string;
    reason: string;
    flexibility: 'mandatory' | 'preferred' | 'flexible';
    alternatives: string[];
}
export interface BusinessConstraint {
    type: 'budget' | 'timeline' | 'resources' | 'compliance' | 'market' | 'competitive';
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string[];
}
export interface RegulatoryConstraint {
    regulation: string;
    jurisdiction: string;
    requirements: string[];
    compliance_level: 'partial' | 'full' | 'certified';
    audit_required: boolean;
    documentation: string[];
}
export interface ResourceConstraint {
    type: 'team' | 'skill' | 'tool' | 'infrastructure' | 'time' | 'budget';
    limitation: string;
    availability: string;
    workaround: string[];
}
export interface IntegrationConstraint {
    system: string;
    type: 'mandatory' | 'optional' | 'future';
    protocol: string;
    dataFormat: string;
    securityRequirements: string[];
    performance: PerformanceRequirement;
}
export interface PerformanceRequirement {
    responseTime: number;
    throughput: number;
    availability: number;
    scalability: 'fixed' | 'auto' | 'elastic';
    concurrency: number;
}
export interface PlanningPreferences {
    architectureStyle: ArchitecturePattern[];
    technologyStack: TechnologyPreference[];
    deploymentModel: DeploymentPreference;
    developmentMethodology: 'agile' | 'waterfall' | 'hybrid' | 'devops';
    qualityApproach: QualityApproach;
    securityApproach: SecurityApproach;
    scalingStrategy: ScalingStrategy;
}
export interface TechnologyPreference {
    category: 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'monitoring' | 'ci_cd';
    preferred: string[];
    avoided: string[];
    experience: 'novice' | 'intermediate' | 'advanced' | 'expert';
    rationale: string;
}
export interface DeploymentPreference {
    environment: 'cloud' | 'on_premise' | 'hybrid' | 'edge';
    provider: string[];
    containerization: boolean;
    orchestration: 'kubernetes' | 'docker_swarm' | 'nomad' | 'none';
    automation: 'full' | 'partial' | 'manual';
}
export interface QualityApproach {
    testingStrategy: TestingStrategy;
    codeQualityStandards: CodeQualityStandard[];
    reviewProcess: ReviewProcess;
    documentation: DocumentationStandard;
    monitoring: MonitoringStrategy;
}
export interface TestingStrategy {
    levels: TestingLevel[];
    coverage: CoverageRequirement;
    automation: AutomationStrategy;
    tools: string[];
    environments: Environment[];
}
export interface TestingLevel {
    type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'accessibility';
    coverage: number;
    automation: boolean;
    frequency: 'commit' | 'daily' | 'release' | 'manual';
}
export interface CoverageRequirement {
    minimum: number;
    target: number;
    critical_paths: number;
    branch_coverage: boolean;
    mutation_testing: boolean;
}
export interface AutomationStrategy {
    level: 'minimal' | 'moderate' | 'comprehensive' | 'full';
    triggers: string[];
    pipeline_integration: boolean;
    reporting: boolean;
}
export interface CodeQualityStandard {
    metric: 'complexity' | 'maintainability' | 'reliability' | 'security' | 'duplication';
    threshold: number;
    enforcement: 'warning' | 'error' | 'blocking';
    tools: string[];
}
export interface ReviewProcess {
    required: boolean;
    reviewers: number;
    automated_checks: string[];
    approval_criteria: string[];
    documentation_required: boolean;
}
export interface DocumentationStandard {
    level: 'minimal' | 'standard' | 'comprehensive' | 'enterprise';
    formats: string[];
    automation: boolean;
    maintenance: string;
}
export interface MonitoringStrategy {
    level: 'basic' | 'standard' | 'advanced' | 'enterprise';
    metrics: string[];
    alerting: AlertingStrategy;
    logging: LoggingStrategy;
    tracing: TracingStrategy;
}
export interface AlertingStrategy {
    channels: string[];
    severities: string[];
    escalation: boolean;
    suppression: boolean;
}
export interface LoggingStrategy {
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    structured: boolean;
    centralized: boolean;
    retention: string;
}
export interface TracingStrategy {
    enabled: boolean;
    distributed: boolean;
    sampling: number;
    correlation: boolean;
}
export interface SecurityApproach {
    model: SecurityModel;
    compliance: ComplianceRequirement[];
    practices: SecurityPractice[];
    tools: SecurityTool[];
    training: SecurityTraining;
}
export interface SecurityModel {
    paradigm: 'perimeter' | 'zero_trust' | 'defense_in_depth' | 'risk_based';
    authentication: AuthenticationStrategy;
    authorization: AuthorizationStrategy;
    encryption: EncryptionStrategy;
    monitoring: SecurityMonitoring;
}
export interface AuthenticationStrategy {
    methods: string[];
    multi_factor: boolean;
    sso: boolean;
    session_management: string;
    password_policy: PasswordPolicy;
}
export interface PasswordPolicy {
    min_length: number;
    complexity: string[];
    rotation: number;
    history: number;
    lockout: LockoutPolicy;
}
export interface LockoutPolicy {
    attempts: number;
    duration: number;
    progressive: boolean;
}
export interface AuthorizationStrategy {
    model: 'rbac' | 'abac' | 'pbac' | 'custom';
    granularity: 'coarse' | 'fine' | 'attribute_based';
    centralized: boolean;
    delegation: boolean;
}
export interface EncryptionStrategy {
    at_rest: EncryptionConfig;
    in_transit: EncryptionConfig;
    key_management: KeyManagementStrategy;
}
export interface EncryptionConfig {
    algorithm: string;
    key_size: number;
    mode: string;
    padding: string;
}
export interface KeyManagementStrategy {
    storage: 'hsm' | 'kms' | 'vault' | 'local';
    rotation: number;
    escrow: boolean;
    separation: boolean;
}
export interface SecurityMonitoring {
    real_time: boolean;
    behavioral: boolean;
    threat_intelligence: boolean;
    incident_response: IncidentResponsePlan;
}
export interface IncidentResponsePlan {
    procedures: string[];
    escalation: string[];
    communication: string[];
    recovery: string[];
    lessons_learned: boolean;
}
export interface ComplianceRequirement {
    standard: string;
    scope: string[];
    evidence: string[];
    audit: AuditRequirement;
    certification: boolean;
}
export interface AuditRequirement {
    frequency: string;
    scope: string[];
    documentation: string[];
    retention: number;
}
export interface SecurityPractice {
    practice: string;
    implementation: string;
    validation: string[];
    automation: boolean;
}
export interface SecurityTool {
    category: 'sast' | 'dast' | 'iast' | 'sca' | 'secrets' | 'compliance';
    tool: string;
    integration: string[];
    automation: boolean;
}
export interface SecurityTraining {
    required: boolean;
    frequency: string;
    topics: string[];
    certification: boolean;
}
export interface ScalingStrategy {
    approach: 'horizontal' | 'vertical' | 'both';
    triggers: ScalingTrigger[];
    limits: ScalingLimit[];
    automation: boolean;
    cost_optimization: boolean;
}
export interface ScalingTrigger {
    metric: string;
    threshold: number;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    duration: number;
}
export interface ScalingLimit {
    resource: string;
    minimum: number;
    maximum: number;
    step_size: number;
}
export interface PlanningContext {
    existing_systems: ExistingSystem[];
    team_profile: TeamProfile;
    organizational_context: OrganizationalContext;
    market_context: MarketContext;
    technical_context: TechnicalContext;
}
export interface ExistingSystem {
    name: string;
    type: string;
    technology: string[];
    integration_points: string[];
    dependencies: string[];
    constraints: string[];
    migration_strategy: 'replace' | 'integrate' | 'coexist' | 'retire';
}
export interface TeamProfile {
    size: number;
    experience: ExperienceProfile;
    skills: SkillProfile[];
    availability: AvailabilityProfile;
    location: LocationProfile;
    methodology_experience: string[];
}
export interface ExperienceProfile {
    average_years: number;
    domain_experience: string[];
    technology_experience: string[];
    methodology_experience: string[];
    project_complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
}
export interface SkillProfile {
    skill: string;
    level: 'novice' | 'intermediate' | 'advanced' | 'expert';
    team_members: number;
    critical: boolean;
    training_available: boolean;
}
export interface AvailabilityProfile {
    full_time: number;
    part_time: number;
    contractor: number;
    timeline_flexibility: 'rigid' | 'moderate' | 'flexible';
}
export interface LocationProfile {
    co_located: boolean;
    time_zones: string[];
    languages: string[];
    cultural_considerations: string[];
}
export interface OrganizationalContext {
    industry: string;
    size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
    culture: 'conservative' | 'moderate' | 'innovative' | 'disruptive';
    risk_tolerance: 'low' | 'medium' | 'high';
    change_readiness: 'low' | 'medium' | 'high';
    governance: GovernanceProfile;
}
export interface GovernanceProfile {
    approval_process: 'simple' | 'moderate' | 'complex';
    compliance_requirements: string[];
    audit_requirements: string[];
    documentation_standards: string[];
    security_policies: string[];
}
export interface MarketContext {
    competition: 'low' | 'medium' | 'high' | 'intense';
    time_to_market: 'flexible' | 'moderate' | 'aggressive';
    innovation_pressure: 'low' | 'medium' | 'high';
    cost_pressure: 'low' | 'medium' | 'high';
    quality_expectations: 'basic' | 'standard' | 'high' | 'premium';
}
export interface TechnicalContext {
    current_architecture: string[];
    legacy_systems: string[];
    infrastructure: InfrastructureContext;
    data_landscape: DataLandscape;
    integration_landscape: IntegrationLandscape;
}
export interface InfrastructureContext {
    current_platforms: string[];
    cloud_adoption: 'none' | 'hybrid' | 'cloud_first' | 'cloud_native';
    containerization: 'none' | 'basic' | 'intermediate' | 'advanced';
    automation: 'manual' | 'basic' | 'intermediate' | 'advanced';
    monitoring: 'basic' | 'intermediate' | 'advanced' | 'enterprise';
}
export interface DataLandscape {
    sources: DataSource[];
    volumes: VolumeProfile;
    quality: DataQualityProfile;
    governance: DataGovernanceProfile;
    privacy: DataPrivacyProfile;
}
export interface DataSource {
    name: string;
    type: 'database' | 'file' | 'api' | 'stream' | 'external';
    technology: string;
    volume: 'small' | 'medium' | 'large' | 'very_large';
    quality: 'poor' | 'fair' | 'good' | 'excellent';
    availability: number;
}
export interface VolumeProfile {
    current: string;
    growth_rate: number;
    peak_patterns: string[];
    storage_requirements: string;
}
export interface DataQualityProfile {
    accuracy: number;
    completeness: number;
    consistency: number;
    timeliness: 'real_time' | 'near_real_time' | 'batch' | 'delayed';
}
export interface DataGovernanceProfile {
    policies: string[];
    ownership: 'centralized' | 'federated' | 'distributed';
    lineage: boolean;
    catalog: boolean;
    quality_monitoring: boolean;
}
export interface DataPrivacyProfile {
    regulations: string[];
    classification: DataClassification[];
    retention: RetentionPolicy[];
    access_controls: AccessControlPolicy[];
}
export interface DataClassification {
    level: 'public' | 'internal' | 'confidential' | 'restricted';
    criteria: string[];
    handling: string[];
}
export interface RetentionPolicy {
    data_type: string;
    retention_period: string;
    archival_strategy: string;
    disposal_method: string;
}
export interface AccessControlPolicy {
    data_type: string;
    access_level: string[];
    approval_required: boolean;
    logging_required: boolean;
}
export interface IntegrationLandscape {
    current_integrations: Integration[];
    patterns: string[];
    tools: string[];
    governance: IntegrationGovernance;
}
export interface Integration {
    name: string;
    type: 'sync' | 'async' | 'batch' | 'real_time';
    protocol: string;
    data_format: string;
    frequency: string;
    reliability: number;
}
export interface IntegrationGovernance {
    standards: string[];
    approval_process: string[];
    monitoring: boolean;
    documentation: boolean;
}
export interface Stakeholder {
    id: string;
    name: string;
    role: string;
    department: string;
    influence: 'low' | 'medium' | 'high' | 'very_high';
    interest: 'low' | 'medium' | 'high' | 'very_high';
    availability: 'limited' | 'moderate' | 'high';
    communication_preference: string[];
    decision_authority: string[];
    concerns: string[];
    expectations: string[];
}
export interface TimelineRequirement {
    deadline: string;
    flexibility: 'fixed' | 'some' | 'flexible';
    milestones: TimelineMilestone[];
    dependencies: TimelineDependency[];
    constraints: string[];
    buffer_time: number;
}
export interface TimelineMilestone {
    name: string;
    description: string;
    date: string;
    type: 'hard' | 'soft' | 'target';
    deliverables: string[];
    dependencies: string[];
}
export interface TimelineDependency {
    name: string;
    type: 'internal' | 'external' | 'resource' | 'approval';
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string[];
}
export interface BudgetConstraint {
    total: number;
    currency: string;
    breakdown: BudgetBreakdown;
    flexibility: 'fixed' | 'some' | 'flexible';
    approval_thresholds: ApprovalThreshold[];
    contingency: number;
}
export interface BudgetBreakdown {
    development: number;
    infrastructure: number;
    licenses: number;
    training: number;
    external_services: number;
    contingency: number;
}
export interface ApprovalThreshold {
    amount: number;
    approver: string;
    process: string[];
}
export interface QualityRequirement {
    standards: QualityStandard[];
    metrics: QualityMetric[];
    processes: QualityProcess[];
    gates: QualityGate[];
    assurance: QualityAssurance;
}
export interface QualityStandard {
    name: string;
    description: string;
    mandatory: boolean;
    measurement: string[];
    validation: string[];
}
export interface QualityMetric {
    name: string;
    target: number;
    threshold: number;
    measurement: string;
    frequency: string;
}
export interface QualityProcess {
    name: string;
    description: string;
    participants: string[];
    artifacts: string[];
    criteria: string[];
}
export interface QualityGate {
    name: string;
    phase: string;
    criteria: string[];
    automation: boolean;
    bypass_conditions: string[];
}
export interface QualityAssurance {
    independent_review: boolean;
    external_audit: boolean;
    certification: string[];
    continuous_monitoring: boolean;
}
export interface PlanningResponse {
    planId: string;
    status: 'draft' | 'review' | 'approved' | 'rejected' | 'revision_required';
    confidence: number;
    plan: DetailedPlan;
    alternatives: AlternativePlan[];
    risks: IdentifiedRisk[];
    recommendations: PlanningRecommendation[];
    validation: PlanValidation;
    estimations: ProjectEstimation;
    nextSteps: NextStep[];
    approvals: ApprovalRequirement[];
}
export interface DetailedPlan {
    overview: PlanOverview;
    architecture: ArchitecturalPlan;
    implementation: ImplementationPlan;
    testing: TestingPlan;
    deployment: DeploymentPlan;
    operations: OperationalPlan;
    governance: GovernancePlan;
}
export interface PlanOverview {
    summary: string;
    approach: string;
    key_decisions: KeyDecision[];
    assumptions: string[];
    constraints: string[];
    success_factors: string[];
}
export interface KeyDecision {
    decision: string;
    rationale: string;
    alternatives: string[];
    trade_offs: string[];
    reversibility: 'reversible' | 'difficult' | 'irreversible';
}
export interface ArchitecturalPlan {
    pattern: ArchitecturePattern;
    components: PlannedComponent[];
    data_architecture: DataArchitecture;
    integration_architecture: IntegrationArchitecture;
    security_architecture: SecurityArchitecture;
    deployment_architecture: DeploymentArchitecture;
}
export interface PlannedComponent {
    name: string;
    type: string;
    technology: string;
    responsibilities: string[];
    interfaces: string[];
    dependencies: string[];
    non_functional_requirements: string[];
    implementation_notes: string[];
}
export interface DataArchitecture {
    model: string;
    storage: StorageStrategy[];
    processing: ProcessingStrategy[];
    governance: string[];
    security: string[];
}
export interface StorageStrategy {
    type: string;
    technology: string;
    use_cases: string[];
    capacity: string;
    performance: string;
    backup: string;
}
export interface ProcessingStrategy {
    type: string;
    technology: string;
    patterns: string[];
    performance: string;
    scalability: string;
}
export interface IntegrationArchitecture {
    patterns: string[];
    protocols: string[];
    security: string[];
    governance: string[];
    monitoring: string[];
}
export interface SecurityArchitecture {
    model: string;
    layers: SecurityLayer[];
    controls: SecurityControl[];
    monitoring: string[];
    incident_response: string[];
}
export interface SecurityLayer {
    name: string;
    purpose: string;
    technologies: string[];
    controls: string[];
}
export interface SecurityControl {
    name: string;
    type: string;
    implementation: string;
    validation: string[];
}
export interface DeploymentArchitecture {
    strategy: string;
    environments: PlannedEnvironment[];
    pipeline: string[];
    automation: string[];
    monitoring: string[];
}
export interface PlannedEnvironment {
    name: Environment;
    purpose: string;
    infrastructure: string[];
    configuration: string[];
    data: string[];
}
export interface ImplementationPlan {
    phases: ImplementationPhase[];
    work_packages: WorkPackage[];
    dependencies: Dependency[];
    resources: ResourcePlan[];
    timeline: ImplementationTimeline;
}
export interface ImplementationPhase {
    name: string;
    objective: string;
    deliverables: string[];
    duration: string;
    resources: string[];
    risks: string[];
    success_criteria: string[];
}
export interface WorkPackage {
    id: string;
    name: string;
    description: string;
    effort: number;
    skills: string[];
    dependencies: string[];
    deliverables: string[];
    acceptance_criteria: string[];
}
export interface Dependency {
    id: string;
    name: string;
    type: 'technical' | 'resource' | 'external' | 'approval';
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string[];
}
export interface ResourcePlan {
    role: string;
    skills: string[];
    effort: number;
    duration: string;
    availability: string;
    alternatives: string[];
}
export interface ImplementationTimeline {
    start_date: string;
    end_date: string;
    milestones: PlannedMilestone[];
    critical_path: string[];
    buffer_time: number;
}
export interface PlannedMilestone {
    name: string;
    date: string;
    deliverables: string[];
    criteria: string[];
    dependencies: string[];
}
export interface TestingPlan {
    strategy: TestStrategy;
    levels: TestLevel[];
    automation: TestAutomation;
    data: TestData;
    environments: TestEnvironment[];
}
export interface TestStrategy {
    approach: string;
    scope: string[];
    priorities: string[];
    criteria: string[];
    tools: string[];
}
export interface TestLevel {
    type: string;
    scope: string[];
    automation: boolean;
    tools: string[];
    coverage: number;
}
export interface TestAutomation {
    framework: string;
    tools: string[];
    pipeline_integration: boolean;
    reporting: string[];
    maintenance: string[];
}
export interface TestData {
    strategy: string;
    sources: string[];
    management: string[];
    privacy: string[];
    refresh: string[];
}
export interface TestEnvironment {
    name: string;
    purpose: string[];
    configuration: string[];
    data: string[];
    availability: string;
}
export interface DeploymentPlan {
    strategy: string;
    environments: string[];
    pipeline: DeploymentPipeline;
    rollback: RollbackStrategy;
    monitoring: string[];
}
export interface DeploymentPipeline {
    stages: PipelineStage[];
    triggers: string[];
    approvals: string[];
    notifications: string[];
    security: string[];
}
export interface PipelineStage {
    name: string;
    type: string;
    actions: string[];
    conditions: string[];
    rollback: string[];
}
export interface RollbackStrategy {
    triggers: string[];
    procedures: string[];
    data_handling: string[];
    communication: string[];
}
export interface OperationalPlan {
    monitoring: OperationalMonitoring;
    maintenance: MaintenancePlan;
    support: SupportPlan;
    capacity: CapacityPlan;
    disaster_recovery: DisasterRecoveryPlan;
}
export interface OperationalMonitoring {
    metrics: string[];
    alerting: string[];
    dashboards: string[];
    reporting: string[];
    tools: string[];
}
export interface MaintenancePlan {
    schedule: string[];
    procedures: string[];
    windows: string[];
    communication: string[];
    rollback: string[];
}
export interface SupportPlan {
    model: string;
    levels: SupportLevel[];
    escalation: string[];
    knowledge_base: string[];
    training: string[];
}
export interface SupportLevel {
    level: string;
    scope: string[];
    response_time: string;
    availability: string;
    skills: string[];
}
export interface CapacityPlan {
    current: string[];
    projections: string[];
    scaling: string[];
    monitoring: string[];
    thresholds: string[];
}
export interface DisasterRecoveryPlan {
    scenarios: string[];
    procedures: string[];
    rto: string;
    rpo: string;
    testing: string[];
}
export interface GovernancePlan {
    framework: string;
    processes: GovernanceProcess[];
    roles: GovernanceRole[];
    decisions: DecisionFramework;
    compliance: CompliancePlan;
}
export interface GovernanceProcess {
    name: string;
    purpose: string;
    participants: string[];
    frequency: string;
    deliverables: string[];
}
export interface GovernanceRole {
    role: string;
    responsibilities: string[];
    authority: string[];
    accountability: string[];
}
export interface DecisionFramework {
    levels: DecisionLevel[];
    escalation: string[];
    documentation: string[];
    review: string[];
}
export interface DecisionLevel {
    level: string;
    scope: string[];
    authority: string[];
    process: string[];
}
export interface CompliancePlan {
    requirements: string[];
    controls: string[];
    monitoring: string[];
    reporting: string[];
    audit: string[];
}
export interface AlternativePlan {
    id: string;
    name: string;
    description: string;
    approach: string;
    trade_offs: TradeOff[];
    effort: number;
    timeline: string;
    risk: number;
    confidence: number;
}
export interface TradeOff {
    aspect: string;
    benefit: string;
    cost: string;
    impact: 'low' | 'medium' | 'high';
}
export interface IdentifiedRisk {
    id: string;
    category: string;
    description: string;
    probability: number;
    impact: number;
    risk_score: number;
    mitigation: string[];
    contingency: string[];
    owner: string;
    timeline: string;
}
export interface PlanningRecommendation {
    id: string;
    type: 'optimization' | 'risk_mitigation' | 'alternative' | 'enhancement';
    description: string;
    rationale: string;
    impact: string;
    effort: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
}
export interface PlanValidation {
    status: 'valid' | 'warnings' | 'errors';
    checks: ValidationCheck[];
    reality_checks: RealityValidation[];
    consistency_checks: ConsistencyCheck[];
    completeness_score: number;
    feasibility_score: number;
}
export interface ValidationCheck {
    id: string;
    category: string;
    description: string;
    status: 'passed' | 'warning' | 'failed';
    message: string;
    recommendations: string[];
}
export interface RealityValidation {
    aspect: string;
    realistic: boolean;
    evidence: string[];
    concerns: string[];
    alternatives: string[];
}
export interface ConsistencyCheck {
    areas: string[];
    consistent: boolean;
    conflicts: string[];
    resolution: string[];
}
export interface ProjectEstimation {
    effort: EffortEstimation;
    timeline: TimelineEstimation;
    cost: CostEstimation;
    resources: ResourceEstimation;
    confidence: EstimationConfidence;
}
export interface EffortEstimation {
    total_hours: number;
    breakdown: EffortBreakdown[];
    methodology: string;
    assumptions: string[];
    risks: string[];
}
export interface EffortBreakdown {
    category: string;
    hours: number;
    confidence: number;
    assumptions: string[];
}
export interface TimelineEstimation {
    duration: string;
    start_date: string;
    end_date: string;
    critical_path: string[];
    dependencies: string[];
    buffer: number;
}
export interface CostEstimation {
    total_cost: number;
    currency: string;
    breakdown: CostBreakdown[];
    assumptions: string[];
    risks: string[];
}
export interface CostBreakdown {
    category: string;
    cost: number;
    recurring: boolean;
    frequency?: string;
}
export interface ResourceEstimation {
    roles: RoleEstimation[];
    skills: SkillEstimation[];
    tools: ToolEstimation[];
    infrastructure: InfrastructureEstimation[];
}
export interface RoleEstimation {
    role: string;
    count: number;
    duration: string;
    cost: number;
    availability: string;
}
export interface SkillEstimation {
    skill: string;
    level: string;
    demand: number;
    availability: string;
    alternatives: string[];
}
export interface ToolEstimation {
    tool: string;
    licenses: number;
    cost: number;
    alternatives: string[];
}
export interface InfrastructureEstimation {
    component: string;
    specification: string;
    cost: number;
    scaling: string;
}
export interface EstimationConfidence {
    overall: number;
    effort: number;
    timeline: number;
    cost: number;
    factors: ConfidenceFactor[];
}
export interface ConfidenceFactor {
    factor: string;
    impact: 'positive' | 'negative';
    magnitude: 'low' | 'medium' | 'high';
    description: string;
}
export interface NextStep {
    id: string;
    action: string;
    description: string;
    owner: string;
    due_date: string;
    dependencies: string[];
    deliverables: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
}
export interface ApprovalRequirement {
    id: string;
    type: 'plan' | 'architecture' | 'budget' | 'timeline' | 'resources';
    approver: string;
    criteria: string[];
    documentation: string[];
    deadline: string;
    escalation: string[];
}
//# sourceMappingURL=planning.d.ts.map