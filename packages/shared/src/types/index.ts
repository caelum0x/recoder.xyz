/**
 * Recoder Shared Types
 * Comprehensive TypeScript types for production-ready code generation
 */

// Export types that don't have conflicts
export * from './user';
export * from './api';

// Export with aliases to resolve naming conflicts
// Agent types
export { Agent, AgentCapabilities, AgentConfiguration, AgentStatus } from './agent';
export { PerformanceMetrics as AgentPerformanceMetrics } from './agent';
export { QualityMetrics as AgentQualityMetrics } from './agent';
export { ValidationMetrics as AgentValidationMetrics } from './agent';
export { GenerationMetrics as AgentGenerationMetrics } from './agent';

// Project types
export { Project, ProjectStatus, ProjectConfiguration, ProjectStructure } from './project';
export { DataFlow, AuthenticationConfig, RetryPolicy } from './project';
export { Dependency as ProjectDependency } from './project';
export { ComplianceRequirement as ProjectComplianceRequirement } from './project';
export { EncryptionConfig as ProjectEncryptionConfig } from './project';
export { MonitoringStrategy as ProjectMonitoringStrategy } from './project';
export { PipelineStage as ProjectPipelineStage } from './project';
export { QualityGate as ProjectQualityGate } from './project';
export { SecurityModel as ProjectSecurityModel } from './project';
export { ValidationCheck as ProjectValidationCheck } from './project';
export { IntegrationValidation as ProjectIntegrationValidation } from './project';
export { StructurePattern as ProjectStructurePattern } from './project';
export { RiskAssessment as ProjectRiskAssessment } from './project';
export { PerformanceMetrics as ProjectPerformanceMetrics } from './project';
export { QualityMetrics as ProjectQualityMetrics } from './project';
export { FileStructure as ProjectFileStructure } from './project';

// Subscription types
export { Subscription, SubscriptionPlan, SubscriptionStatus, BillingInfo } from './subscription';
export { SupportLevel as SubscriptionSupportLevel } from './subscription';

// Planning types  
export { PlanningRequest } from './planning';
export { DataSource as PlanningDataSource } from './planning';
export { ComplianceRequirement as PlanningComplianceRequirement } from './planning';
export { Dependency as PlanningDependency } from './planning';
export { EncryptionConfig as PlanningEncryptionConfig } from './planning';
export { MonitoringStrategy as PlanningMonitoringStrategy } from './planning';
export { PipelineStage as PlanningPipelineStage } from './planning';
export { QualityGate as PlanningQualityGate } from './planning';
export { SecurityModel as PlanningSecurityModel } from './planning';
export { ValidationCheck as PlanningValidationCheck } from './planning';
export { SupportLevel as PlanningSupportLevel } from './planning';
export { RealityValidation as PlanningRealityValidation } from './planning';

// Planner types (from planner.ts)
export {
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
export { ValidationRule, ValidationError, ValidationWarning } from './validation';
export { QualityMetrics as ValidationQualityMetrics } from './validation';
export { ValidationMetrics as ValidationValidationMetrics } from './validation';
export { QualityGate as ValidationQualityGate } from './validation';
export { RiskAssessment as ValidationRiskAssessment } from './validation';
export { ValidationOptions as ValidationValidationOptions } from './validation';
export { ValidationResult as ValidationValidationResult } from './validation';

// Common types
export { Timestamp } from './common';
export { CodeQuality as CommonCodeQuality } from './common';
export { ValidationLevel as CommonValidationLevel } from './common';

// Code generation types
export {
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
export { ValidationOptions as CodeGenerationValidationOptions } from './code-generation';
export { ValidationResult as CodeGenerationValidationResult } from './code-generation';
export { GenerationMetrics as CodeGenerationGenerationMetrics } from './code-generation';
export { Dependency as CodeGenerationDependency } from './code-generation';
export { FileStructure as CodeGenerationFileStructure } from './code-generation';
export { IntegrationValidation as CodeGenerationIntegrationValidation } from './code-generation';
export { StructurePattern as CodeGenerationStructurePattern } from './code-generation';
export { CodeQuality as CodeGenerationCodeQuality } from './code-generation';
export { ValidationLevel as CodeGenerationValidationLevel } from './code-generation';
export { RealityValidation as CodeGenerationRealityValidation } from './code-generation';