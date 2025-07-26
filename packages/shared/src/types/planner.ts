/**
 * Project Planner Types
 * Core types for the project planning system that ensures real code generation
 */

import { MonitoringConfig, RateLimitConfig } from "./ai-models";
import { CodePattern, SecurityValidation } from "./code-generation";
import { MonitoringConfiguration } from "./codeGeneration";
import { DataSource } from "./planning";
import { DataFlow, SecurityModel, FileStructure, AuthenticationConfig, RetryPolicy } from "./project";

// Additional missing type definitions
export interface ScalabilityPlan {
  strategy: string;
  metrics: string[];
  thresholds: number[];
  scaling_actions: string[];
}

export interface DeploymentStrategy {
  type: string;
  environment: string;
  steps: string[];
  rollback_plan: string;
}

export interface TechnologyStack {
  frontend: string[];
  backend: string[];
  database: string[];
  infrastructure: string[];
  third_party: string[];
  primary_language?: string;
  framework?: string;
  deployment_platform?: string;
}

export interface RealWorldConsideration {
  type: string;
  description: string;
  impact: string;
  mitigation: string[];
}

export interface ComponentConfiguration {
  parameters: Record<string, any>;
  environment_variables: Record<string, string>;
  secrets: string[];
  dependencies: string[];
}

export interface AuthenticationMethod {
  type: string;
  config: Record<string, any>;
  security_level: string;
}

export interface RateLimitingConfig {
  requests_per_minute: number;
  burst_limit: number;
  strategy: string;
}

export interface ValidationConfig {
  schema: any;
  rules: string[];
  error_handling: string;
}

export interface EnvironmentVariable {
  name: string;
  value: string;
  required: boolean;
  sensitive: boolean;
}

export interface SecretConfig {
  name: string;
  source: string;
  rotation_policy: string;
}

export interface DatabaseSchema {
  name: string;
  tables: string[];
  relationships: string[];
  constraints: string[];
}

export interface FallbackStrategy {
  type: string;
  conditions: string[];
  actions: string[];
}

export interface TimeoutConfig {
  connection_timeout: number;
  request_timeout: number;
  retry_timeout: number;
}

export interface CircuitBreakerConfig {
  failure_threshold: number;
  recovery_timeout: number;
  half_open_max_calls: number;
}

export interface ServiceMonitoring {
  health_check: string;
  metrics: string[];
  alerts: string[];
  logs: string[];
}

export interface CostBenefitAnalysis {
  benefits: string[];
  costs: string[];
  roi_calculation: string;
  timeline: string;
}

export interface TestDataStrategy {
  type: string;
  generation_method: string;
  volume: number;
  privacy_level: string;
}

export interface ExternalDependencyStrategy {
  dependency: string;
  strategy: string;
  fallback: string;
  monitoring: string;
}

export interface PerformanceBenchmark {
  metric: string;
  target: number;
  measurement_method: string;
  frequency: string;
}

export interface EnvironmentConfiguration {
  variables: Record<string, string>;
  secrets: string[];
  resources: string[];
  networking: string[];
}

export interface AccessControl {
  type: string;
  permissions: string[];
  restrictions: string[];
  audit_trail: boolean;
}

export interface ProjectRequirement {
  id: string;
  type: 'functional' | 'non-functional' | 'integration' | 'business' | 'technical';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  acceptance_criteria: string[];
  dependencies: string[];
  complexity: number; // 1-10 scale
  estimated_hours: number;
  tags: string[];
  domain: ProjectDomain;
  real_world_constraints: RealWorldConstraint[];
  validation_steps: ValidationStep[];
}

export interface RealWorldConstraint {
  type: 'legal' | 'regulatory' | 'technical' | 'business' | 'security' | 'performance';
  description: string;
  impact: 'blocking' | 'high' | 'medium' | 'low';
  mitigation: string[];
  validation_method: string;
}

export interface ValidationStep {
  id: string;
  description: string;
  type: 'unit_test' | 'integration_test' | 'manual_test' | 'automated_check' | 'external_validation';
  criteria: string;
  tools: string[];
  expected_outcome: string;
  failure_action: string;
}

export interface ArchitecturalPlan {
  id: string;
  name: string;
  description: string;
  pattern: ArchitecturalPattern;
  components: SystemComponent[];
  data_flow: DataFlow[];
  security_model: SecurityModel;
  scalability_plan: ScalabilityPlan;
  deployment_strategy: DeploymentStrategy;
  technology_stack: TechnologyStack;
  real_world_considerations: RealWorldConsideration[];
}

export interface SystemComponent {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'storage' | 'external_service';
  description: string;
  responsibilities: string[];
  interfaces: ComponentInterface[];
  dependencies: string[];
  configuration: ComponentConfiguration;
  monitoring: MonitoringConfig;
  real_implementation: RealImplementation;
}

export interface ComponentInterface {
  name: string;
  type: 'rest_api' | 'graphql' | 'websocket' | 'grpc' | 'event_bus' | 'database' | 'file_system';
  specification: any; // OpenAPI, GraphQL schema, etc.
  authentication: AuthenticationMethod;
  rate_limiting: RateLimitingConfig;
  validation: ValidationConfig;
  real_endpoints: RealEndpoint[];
}

export interface RealEndpoint {
  url: string;
  method: string;
  purpose: string;
  request_schema: any;
  response_schema: any;
  side_effects: string[];
  external_dependencies: string[];
  business_logic: BusinessLogic[];
}

export interface BusinessLogic {
  name: string;
  description: string;
  inputs: Parameter[];
  outputs: Parameter[];
  rules: BusinessRule[];
  real_world_impact: string;
  validation_method: string;
}

export interface BusinessRule {
  condition: string;
  action: string;
  exception_handling: string;
  audit_trail: boolean;
  compliance_requirement?: string;
}

export interface RealImplementation {
  technology: string;
  version: string;
  configuration: Record<string, any>;
  environment_variables: EnvironmentVariable[];
  secrets: SecretConfig[];
  external_services: ExternalServiceConfig[];
  database_schema: DatabaseSchema[];
  file_structure: FileStructure[];
  real_code_patterns: CodePattern[];
}

export interface ExternalServiceConfig {
  name: string;
  type: 'payment' | 'authentication' | 'storage' | 'notification' | 'analytics' | 'blockchain' | 'ai' | 'other';
  provider: string;
  plan: string;
  configuration: ServiceConfiguration;
  api_integration: ApiIntegration;
  fallback_strategy: FallbackStrategy;
  cost_analysis: CostAnalysis;
  compliance_requirements: string[];
}

export interface ServiceConfiguration {
  endpoint: string;
  authentication: AuthenticationConfig;
  rate_limits: RateLimitConfig;
  timeouts: TimeoutConfig;
  retry_policy: RetryPolicy;
  circuit_breaker: CircuitBreakerConfig;
  monitoring: ServiceMonitoring;
}

export interface ApiIntegration {
  sdk_available: boolean;
  sdk_language: string[];
  rest_api: boolean;
  graphql: boolean;
  webhooks: boolean;
  real_time: boolean;
  batch_processing: boolean;
  data_formats: string[];
  authentication_methods: string[];
}

export interface ImplementationPlan {
  id: string;
  name: string;
  description: string;
  phases: ImplementationPhase[];
  total_estimated_hours: number;
  critical_path: string[];
  risk_factors: RiskFactor[];
  success_metrics: SuccessMetric[];
  quality_gates: QualityGate[];
  real_world_validations: RealWorldValidation[];
}

export interface ImplementationPhase {
  id: string;
  name: string;
  description: string;
  order: number;
  estimated_hours: number;
  tasks: ImplementationTask[];
  deliverables: Deliverable[];
  acceptance_criteria: string[];
  dependencies: string[];
  risks: string[];
  real_world_tests: RealWorldTest[];
}

export interface ImplementationTask {
  id: string;
  name: string;
  description: string;
  type: 'development' | 'testing' | 'deployment' | 'configuration' | 'integration' | 'documentation';
  estimated_hours: number;
  complexity: number;
  priority: number;
  dependencies: string[];
  deliverables: string[];
  real_world_requirements: RealWorldRequirement[];
  validation_criteria: TaskValidationCriteria[];
  anti_mock_checks: AntiMockCheck[];
}

export interface RealWorldRequirement {
  type: 'external_service' | 'database_operation' | 'file_operation' | 'network_call' | 'blockchain_transaction';
  description: string;
  configuration_needed: ConfigurationItem[];
  validation_method: string;
  success_criteria: string;
  failure_handling: string;
}

export interface AntiMockCheck {
  name: string;
  description: string;
  check_type: 'static_analysis' | 'runtime_verification' | 'integration_test' | 'manual_review';
  criteria: string;
  tools: string[];
  automated: boolean;
  severity: 'error' | 'warning' | 'info';
}

export interface RealWorldTest {
  name: string;
  description: string;
  type: 'integration' | 'end_to_end' | 'performance' | 'security' | 'compliance' | 'user_acceptance' | 'reliability';
  environment: 'development' | 'staging' | 'production';
  data_requirements: TestDataRequirement[];
  external_dependencies: string[];
  success_criteria: string[];
  real_world_impact: string;
}

export interface TestDataRequirement {
  type: 'synthetic' | 'anonymized_production' | 'real_world_sample';
  description: string;
  volume: number;
  characteristics: string[];
  privacy_considerations: string[];
  compliance_requirements: string[];
}

export interface RealWorldValidation {
  name: string;
  description: string;
  validation_type: 'functional' | 'performance' | 'security' | 'compliance' | 'user_experience';
  methodology: string;
  tools: string[];
  criteria: ValidationCriteria[];
  real_world_scenarios: RealWorldScenario[];
}

export interface RealWorldScenario {
  name: string;
  description: string;
  actors: string[];
  steps: ScenarioStep[];
  expected_outcomes: string[];
  real_world_constraints: string[];
  business_impact: string;
}

export interface ScenarioStep {
  order: number;
  description: string;
  actor: string;
  action: string;
  expected_result: string;
  real_world_implications: string[];
}

export interface MockDetectionResult {
  is_mock: boolean;
  confidence: number;
  indicators: MockIndicator[];
  real_world_alternatives: RealWorldAlternative[];
  transformation_plan: TransformationPlan;
}

export interface MockIndicator {
  type: 'hardcoded_data' | 'fake_service' | 'placeholder_logic' | 'dummy_authentication' | 'test_data';
  location: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  impact: string;
}

export interface RealWorldAlternative {
  name: string;
  description: string;
  implementation_effort: number;
  cost: number;
  benefits: string[];
  risks: string[];
  timeline: string;
}

export interface TransformationPlan {
  steps: TransformationStep[];
  estimated_effort: number;
  cost_benefit_analysis: CostBenefitAnalysis;
  timeline: string;
  risks: string[];
  success_metrics: string[];
}

export interface TransformationStep {
  order: number;
  name: string;
  description: string;
  type: 'code_change' | 'configuration' | 'external_service' | 'database' | 'infrastructure';
  estimated_hours: number;
  dependencies: string[];
  validation_steps: string[];
  rollback_plan: string;
}

export interface ProjectDomain {
  name: string;
  type: 'fintech' | 'e_commerce' | 'social_media' | 'gaming' | 'enterprise' | 'blockchain' | 'ai_ml' | 'iot' | 'other';
  characteristics: DomainCharacteristic[];
  common_patterns: ArchitecturalPattern[];
  typical_integrations: string[];
  regulatory_requirements: string[];
  security_considerations: string[];
  scalability_patterns: string[];
}

export interface DomainCharacteristic {
  name: string;
  description: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  typical_solutions: string[];
  common_pitfalls: string[];
  best_practices: string[];
}

export interface ArchitecturalPattern {
  name: string;
  description: string;
  use_cases: string[];
  benefits: string[];
  drawbacks: string[];
  implementation_complexity: number;
  real_world_examples: string[];
  technology_requirements: string[];
}

export interface PlanningContext {
  user_requirements: string;
  project_type: string;
  target_audience: string;
  business_goals: string[];
  technical_constraints: string[];
  budget_constraints: BudgetConstraint[];
  timeline_constraints: TimelineConstraint[];
  compliance_requirements: string[];
  existing_systems: ExistingSystem[];
  team_capabilities: TeamCapability[];
}

export interface BudgetConstraint {
  category: 'development' | 'infrastructure' | 'external_services' | 'licensing' | 'maintenance';
  limit: number;
  currency: string;
  timeframe: string;
  flexibility: 'fixed' | 'flexible' | 'negotiable';
}

export interface TimelineConstraint {
  milestone: string;
  deadline: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  flexibility: 'fixed' | 'flexible' | 'negotiable';
}

export interface ExistingSystem {
  name: string;
  type: string;
  version: string;
  integration_points: string[];
  migration_required: boolean;
  data_migration: boolean;
  constraints: string[];
  deprecation_timeline?: string;
}

export interface TeamCapability {
  skill: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  team_members: number;
  availability: number; // percentage
  learning_curve: number; // weeks
  external_support_needed: boolean;
}

export interface PlanningResult {
  requirements: ProjectRequirement[];
  architecture: ArchitecturalPlan;
  implementation_plan: ImplementationPlan;
  real_world_validations: RealWorldValidation[];
  anti_mock_strategy: AntiMockStrategy;
  success_metrics: SuccessMetric[];
  risk_assessment: RiskAssessment;
  cost_analysis: CostAnalysis;
  timeline: ProjectTimeline;
  quality_assurance: QualityAssurancePlan;
}

export interface AntiMockStrategy {
  detection_methods: MockDetectionMethod[];
  prevention_measures: PreventionMeasure[];
  validation_checkpoints: ValidationCheckpoint[];
  real_world_testing: RealWorldTestingPlan[];
  continuous_monitoring: ContinuousMonitoring[];
}

export interface MockDetectionMethod {
  name: string;
  description: string;
  automated: boolean;
  frequency: 'continuous' | 'on_commit' | 'on_build' | 'on_deploy' | 'manual';
  tools: string[];
  accuracy: number;
  false_positive_rate: number;
}

export interface PreventionMeasure {
  name: string;
  description: string;
  implementation: 'code_review' | 'automated_check' | 'template_constraint' | 'runtime_validation';
  enforcement_level: 'error' | 'warning' | 'info';
  bypass_conditions: string[];
}

export interface ValidationCheckpoint {
  phase: 'planning' | 'development' | 'testing' | 'deployment' | 'monitoring';
  name: string;
  description: string;
  criteria: ValidationCriteria[];
  automated: boolean;
  blocking: boolean;
  remediation_steps: string[];
}

export interface RealWorldTestingPlan {
  name: string;
  description: string;
  environments: TestEnvironment[];
  data_strategy: TestDataStrategy;
  external_dependencies: ExternalDependencyStrategy[];
  performance_benchmarks: PerformanceBenchmark[];
  security_validations: SecurityValidation[];
}

export interface TestEnvironment {
  name: string;
  type: 'development' | 'staging' | 'production_like' | 'production';
  configuration: EnvironmentConfiguration;
  data_sources: DataSource[];
  monitoring: MonitoringConfiguration;
  access_controls: AccessControl[];
}

export interface ContinuousMonitoring {
  metric: string;
  description: string;
  collection_method: string;
  frequency: string;
  alert_threshold: number;
  alert_action: string;
  dashboard_widget: DashboardWidget;
}

export interface DashboardWidget {
  type: 'chart' | 'metric' | 'table' | 'alert' | 'log';
  configuration: Record<string, any>;
  refresh_rate: number;
  access_level: 'public' | 'team' | 'admin';
}

// Common interfaces used across the system
export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  validation: ValidationRule[];
  default_value?: any;
}

export interface ValidationRule {
  type: string;
  value: any;
  message: string;
}

export interface ValidationCriteria {
  name: string;
  description: string;
  type: 'automated' | 'manual' | 'hybrid';
  pass_threshold: number;
  measurement_unit: string;
  tools: string[];
}

export interface ConfigurationItem {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  validation: ValidationRule[];
}

export interface TaskValidationCriteria {
  name: string;
  description: string;
  type: 'unit_test' | 'integration_test' | 'manual_check' | 'automated_scan';
  pass_criteria: string;
  fail_criteria: string;
  tools: string[];
}

export interface Deliverable {
  name: string;
  type: 'code' | 'documentation' | 'configuration' | 'deployment' | 'test' | 'infrastructure';
  description: string;
  acceptance_criteria: string[];
  quality_standards: string[];
  dependencies: string[];
}

export interface SuccessMetric {
  name: string;
  description: string;
  type: 'quantitative' | 'qualitative';
  measurement_method: string;
  target_value: number;
  current_value?: number;
  unit: string;
  frequency: string;
  stakeholder: string;
}

export interface RiskFactor {
  name: string;
  description: string;
  category: 'technical' | 'business' | 'timeline' | 'resource' | 'external';
  probability: number; // 0-1
  impact: number; // 1-10
  mitigation_strategies: string[];
  contingency_plans: string[];
  monitoring_indicators: string[];
}

export interface QualityGate {
  name: string;
  description: string;
  phase: 'planning' | 'development' | 'testing' | 'deployment' | 'production';
  criteria: QualityGateCriteria[];
  automated: boolean;
  blocking: boolean;
  escalation_procedure: string;
}

export interface QualityGateCriteria {
  metric: string;
  threshold: number;
  operator: '>' | '<' | '=' | '>=' | '<=';
  measurement_method: string;
  tools: string[];
}

export interface RiskAssessment {
  overall_risk_score: number;
  risk_factors: RiskFactor[];
  mitigation_plan: MitigationPlan;
  contingency_strategies: ContingencyStrategy[];
  monitoring_plan: RiskMonitoringPlan;
}

export interface MitigationPlan {
  strategies: MitigationStrategy[];
  timeline: string;
  cost: number;
  success_probability: number;
  fallback_options: string[];
}

export interface MitigationStrategy {
  risk_id: string;
  strategy: string;
  implementation_steps: string[];
  cost: number;
  timeline: string;
  success_probability: number;
  side_effects: string[];
}

export interface ContingencyStrategy {
  trigger_conditions: string[];
  actions: string[];
  timeline: string;
  resources_required: string[];
  impact_assessment: string;
}

export interface RiskMonitoringPlan {
  indicators: RiskIndicator[];
  monitoring_frequency: string;
  escalation_thresholds: EscalationThreshold[];
  reporting_schedule: string;
  stakeholder_notifications: string[];
}

export interface RiskIndicator {
  name: string;
  description: string;
  measurement_method: string;
  normal_range: [number, number];
  warning_threshold: number;
  critical_threshold: number;
  data_source: string;
}

export interface EscalationThreshold {
  level: 'warning' | 'critical' | 'emergency';
  conditions: string[];
  actions: string[];
  stakeholders: string[];
  timeline: string;
}

export interface CostAnalysis {
  total_cost: number;
  cost_breakdown: CostBreakdown[];
  cost_over_time: CostProjection[];
  cost_optimization_opportunities: CostOptimization[];
  roi_analysis: ROIAnalysis;
}

export interface CostBreakdown {
  category: string;
  amount: number;
  percentage: number;
  timeline: string;
  certainty: 'high' | 'medium' | 'low';
  factors: string[];
}

export interface CostProjection {
  period: string;
  amount: number;
  category: string;
  assumptions: string[];
  confidence_level: number;
}

export interface CostOptimization {
  opportunity: string;
  potential_savings: number;
  implementation_cost: number;
  timeline: string;
  risks: string[];
  benefits: string[];
}

export interface ROIAnalysis {
  total_investment: number;
  expected_return: number;
  payback_period: number;
  net_present_value: number;
  internal_rate_of_return: number;
  assumptions: string[];
  sensitivity_analysis: SensitivityAnalysis[];
}

export interface SensitivityAnalysis {
  variable: string;
  impact_on_roi: number;
  scenario_analysis: ScenarioAnalysis[];
}

export interface ScenarioAnalysis {
  scenario: string;
  probability: number;
  roi_impact: number;
  mitigation_strategies: string[];
}

export interface ProjectTimeline {
  total_duration: number;
  phases: TimelinePhase[];
  milestones: Milestone[];
  critical_path: string[];
  buffer_time: number;
  dependencies: TimelineDependency[];
}

export interface TimelinePhase {
  name: string;
  start_date: string;
  end_date: string;
  duration: number;
  deliverables: string[];
  dependencies: string[];
  resources_required: string[];
}

export interface Milestone {
  name: string;
  date: string;
  description: string;
  deliverables: string[];
  success_criteria: string[];
  stakeholder_review: boolean;
}

export interface TimelineDependency {
  from: string;
  to: string;
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  lag: number;
  constraint: string;
}

export interface QualityAssurancePlan {
  quality_objectives: QualityObjective[];
  quality_processes: QualityProcess[];
  quality_metrics: QualityMetric[];
  quality_gates: QualityGate[];
  continuous_improvement: ContinuousImprovementPlan;
}

export interface QualityObjective {
  name: string;
  description: string;
  target_value: number;
  measurement_method: string;
  frequency: string;
  stakeholder: string;
}

export interface QualityProcess {
  name: string;
  description: string;
  steps: ProcessStep[];
  inputs: string[];
  outputs: string[];
  quality_controls: QualityControl[];
}

export interface ProcessStep {
  order: number;
  name: string;
  description: string;
  responsible_party: string;
  inputs: string[];
  outputs: string[];
  quality_checks: string[];
}

export interface QualityControl {
  name: string;
  type: 'inspection' | 'testing' | 'review' | 'audit';
  frequency: string;
  criteria: string[];
  corrective_actions: string[];
}

export interface QualityMetric {
  name: string;
  description: string;
  calculation_method: string;
  target_value: number;
  current_value?: number;
  trend: 'improving' | 'stable' | 'declining';
  action_threshold: number;
}

export interface ContinuousImprovementPlan {
  improvement_cycles: ImprovementCycle[];
  feedback_mechanisms: FeedbackMechanism[];
  learning_objectives: LearningObjective[];
  knowledge_sharing: KnowledgeSharing[];
}

export interface ImprovementCycle {
  name: string;
  duration: string;
  objectives: string[];
  activities: string[];
  success_metrics: string[];
  retrospective_process: string;
}

export interface FeedbackMechanism {
  name: string;
  type: 'survey' | 'interview' | 'observation' | 'metrics' | 'review';
  frequency: string;
  participants: string[];
  analysis_method: string;
  action_planning: string;
}

export interface LearningObjective {
  name: string;
  description: string;
  target_audience: string[];
  learning_methods: string[];
  success_criteria: string[];
  timeline: string;
}

export interface KnowledgeSharing {
  method: string;
  frequency: string;
  participants: string[];
  content_types: string[];
  storage_location: string;
  access_controls: string[];
}

// Additional specialized interfaces for specific domains
export interface BlockchainRequirement extends ProjectRequirement {
  network: string;
  consensus_mechanism: string;
  smart_contract_language: string;
  gas_optimization: boolean;
  security_audit_required: boolean;
  compliance_standards: string[];
}

export interface FinTechRequirement extends ProjectRequirement {
  regulatory_compliance: string[];
  security_standards: string[];
  audit_requirements: string[];
  data_residency: string[];
  payment_processing: boolean;
  kyc_requirements: boolean;
}

export interface ECommerceRequirement extends ProjectRequirement {
  payment_gateways: string[];
  inventory_management: boolean;
  order_fulfillment: boolean;
  customer_support: boolean;
  analytics_tracking: boolean;
  mobile_optimization: boolean;
}