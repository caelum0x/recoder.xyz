/**
 * Recoder Shared Types
 * Comprehensive TypeScript types for production-ready code generation
 */

// Export types that don't have conflicts
export * from './user';
export * from './api';

// Export with aliases to resolve naming conflicts
// Agent types
export type { Agent, AgentCapabilities, AgentConfiguration, AgentStatus } from './agent';
export type { PerformanceMetrics as AgentPerformanceMetrics } from './agent';
export type { QualityMetrics as AgentQualityMetrics } from './agent';
export type { ValidationMetrics as AgentValidationMetrics } from './agent';
export type { GenerationMetrics as AgentGenerationMetrics } from './agent';

// Project types
export type { Project, ProjectStatus, ProjectConfiguration, ProjectStructure } from './project';
export type { DataFlow, AuthenticationConfig, RetryPolicy } from './project';
export type { Dependency as ProjectDependency } from './project';
export type { ComplianceRequirement as ProjectComplianceRequirement } from './project';
export type { EncryptionConfig as ProjectEncryptionConfig } from './project';
export type { MonitoringStrategy as ProjectMonitoringStrategy } from './project';
export type { PipelineStage as ProjectPipelineStage } from './project';
export type { QualityGate as ProjectQualityGate } from './project';
export type { SecurityModel as ProjectSecurityModel } from './project';
export type { ValidationCheck as ProjectValidationCheck } from './project';
export type { IntegrationValidation as ProjectIntegrationValidation } from './project';
export type { StructurePattern as ProjectStructurePattern } from './project';
export type { RiskAssessment as ProjectRiskAssessment } from './project';
export type { PerformanceMetrics as ProjectPerformanceMetrics } from './project';
export type { QualityMetrics as ProjectQualityMetrics } from './project';
export type { FileStructure as ProjectFileStructure } from './project';

// Subscription types
export type { Subscription, SubscriptionPlan, SubscriptionStatus, BillingInfo } from './subscription';
export type { SupportLevel as SubscriptionSupportLevel } from './subscription';

// Planning types  
export type { PlanningRequest } from './planning';
export type { DataSource as PlanningDataSource } from './planning';
export type { ComplianceRequirement as PlanningComplianceRequirement } from './planning';
export type { Dependency as PlanningDependency } from './planning';
export type { EncryptionConfig as PlanningEncryptionConfig } from './planning';
export type { MonitoringStrategy as PlanningMonitoringStrategy } from './planning';
export type { PipelineStage as PlanningPipelineStage } from './planning';
export type { QualityGate as PlanningQualityGate } from './planning';
export type { SecurityModel as PlanningSecurityModel } from './planning';
export type { ValidationCheck as PlanningValidationCheck } from './planning';
export type { SupportLevel as PlanningSupportLevel } from './planning';
export type { RealityValidation as PlanningRealityValidation } from './planning';

// Planner types (from planner.ts)
export type {
  ProjectRequirement,
  ArchitecturalPlan,
  ImplementationPlan,
  PlanningContext,
  PlanningResult,
  MockDetectionResult,
  RealWorldValidation,
  AntiMockStrategy,
  ProjectDomain,
  ExternalServiceConfig,
  SystemComponent,
  RealImplementation,
  BusinessLogic,
  TransformationPlan,
  CostAnalysis,
  ProjectTimeline,
  QualityAssurancePlan,
  BlockchainRequirement,
  FinTechRequirement,
  ECommerceRequirement,
  RealWorldRequirement,
  AntiMockCheck,
  ValidationStep,
  RealWorldTest,
  ImplementationTask,
  SuccessMetric,
  RiskFactor,
  MockIndicator,
  RealWorldAlternative,
  DomainCharacteristic,
  ServiceConfiguration,
  ApiIntegration,
  TestDataRequirement,
  RealWorldScenario,
  ValidationCriteria,
  PreventionMeasure,
  ValidationCheckpoint,
  RealWorldTestingPlan,
  ContinuousMonitoring
} from './planner';

// Validation types
export type { ValidationRule, ValidationError, ValidationWarning } from './validation';
export type { QualityMetrics as ValidationQualityMetrics } from './validation';
export type { ValidationMetrics as ValidationValidationMetrics } from './validation';
export type { QualityGate as ValidationQualityGate } from './validation';
export type { RiskAssessment as ValidationRiskAssessment } from './validation';
export type { ValidationOptions as ValidationValidationOptions } from './validation';
export type { ValidationResult as ValidationValidationResult } from './validation';

// Common types
export type { Timestamp } from './common';
export type { CodeQuality as CommonCodeQuality } from './common';
export type { ValidationLevel as CommonValidationLevel } from './common';

// Code generation types
export type {
  GenerationType,
  GenerationRequest,
  GenerationResult,
  GenerationStatus,
  GeneratedFile,
  GenerationContext,
  GenerationOptions,
  RealityCheckOptions,
  GenerationTargets,
  FileTarget,
  TestTarget,
  DocumentationTarget,
  ConfigurationTarget,
  GenerationError,
  GenerationWarning,
  GenerationSuggestion,
  CodeLocation
} from './code-generation';

// Aliased exports from code-generation to avoid conflicts
export type { ValidationOptions as CodeGenerationValidationOptions } from './code-generation';
export type { ValidationResult as CodeGenerationValidationResult } from './code-generation';
export type { GenerationMetrics as CodeGenerationGenerationMetrics } from './code-generation';
export type { Dependency as CodeGenerationDependency } from './code-generation';
export type { FileStructure as CodeGenerationFileStructure } from './code-generation';
export type { IntegrationValidation as CodeGenerationIntegrationValidation } from './code-generation';
export type { StructurePattern as CodeGenerationStructurePattern } from './code-generation';
export type { CodeQuality as CodeGenerationCodeQuality } from './code-generation';
export type { ValidationLevel as CodeGenerationValidationLevel } from './code-generation';
export type { RealityValidation as CodeGenerationRealityValidation } from './code-generation';