/**
 * Agent types and interfaces
 */
import { Timestamp, ValidationLevel } from './common';
export declare enum AgentRole {
    ARCHITECT = "architect",
    DEVELOPER = "developer",
    REVIEWER = "reviewer",
    TESTER = "tester",
    SECURITY = "security",
    DEVOPS = "devops",
    SPECIALIST = "specialist",
    GENERAL = "general"
}
export declare enum AgentStatus {
    ACTIVE = "active",
    TRAINING = "training",
    INACTIVE = "inactive",
    DEPRECATED = "deprecated"
}
export declare enum ModelProvider {
    OPENAI = "openai",
    ANTHROPIC = "anthropic",
    GOOGLE = "google",
    COHERE = "cohere",
    HUGGINGFACE = "huggingface",
    OLLAMA = "ollama",
    CUSTOM = "custom"
}
export interface Agent {
    id: string;
    name: string;
    description: string;
    role: AgentRole;
    status: AgentStatus;
    capabilities: AgentCapabilities;
    configuration: AgentConfiguration;
    performance: AgentPerformance;
    specializations: string[];
    supportedLanguages: string[];
    supportedFrameworks: string[];
    createdBy: string;
    isPublic: boolean;
    version: string;
    timestamps: Timestamp;
}
export interface AgentCapabilities {
    planning: PlanningCapabilities;
    codeGeneration: CodeGenerationCapabilities;
    validation: ValidationCapabilities;
    debugging: DebuggingCapabilities;
    testing: TestingCapabilities;
    documentation: DocumentationCapabilities;
    refactoring: RefactoringCapabilities;
    security: SecurityCapabilities;
}
export interface PlanningCapabilities {
    architectureDesign: boolean;
    requirementAnalysis: boolean;
    technologySelection: boolean;
    estimationAccuracy: number;
    complexityHandling: 'basic' | 'intermediate' | 'advanced' | 'expert';
}
export interface CodeGenerationCapabilities {
    languages: string[];
    frameworks: string[];
    patterns: DesignPattern[];
    qualityLevel: CodeQualityLevel;
    realIntegrations: boolean;
    productionReadiness: boolean;
    testGeneration: boolean;
    documentationGeneration: boolean;
}
export interface ValidationCapabilities {
    syntaxValidation: boolean;
    semanticValidation: boolean;
    securityValidation: boolean;
    performanceValidation: boolean;
    bestPracticesValidation: boolean;
    realityChecking: boolean;
    dependencyValidation: boolean;
}
export interface DebuggingCapabilities {
    errorDetection: boolean;
    rootCauseAnalysis: boolean;
    solutionSuggestion: boolean;
    performanceDebugging: boolean;
    securityIssueDetection: boolean;
}
export interface TestingCapabilities {
    unitTesting: boolean;
    integrationTesting: boolean;
    e2eTesting: boolean;
    performanceTesting: boolean;
    securityTesting: boolean;
    testDataGeneration: boolean;
    mockingStrategy: 'minimal' | 'balanced' | 'comprehensive';
}
export interface DocumentationCapabilities {
    apiDocumentation: boolean;
    codeComments: boolean;
    architecturalDocs: boolean;
    userDocumentation: boolean;
    deploymentGuides: boolean;
}
export interface RefactoringCapabilities {
    codeCleanup: boolean;
    performanceOptimization: boolean;
    securityHardening: boolean;
    modernization: boolean;
    patternApplication: boolean;
}
export interface SecurityCapabilities {
    vulnerabilityDetection: boolean;
    secureCodeGeneration: boolean;
    authenticationPatterns: boolean;
    dataProtection: boolean;
    complianceChecking: string[];
}
export interface AgentConfiguration {
    model: ModelConfiguration;
    parameters: AgentParameters;
    constraints: AgentConstraints;
    integrations: AgentIntegrations;
}
export interface ModelConfiguration {
    provider: ModelProvider;
    modelName: string;
    version: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    stopSequences: string[];
    customPrompts: CustomPrompt[];
}
export interface CustomPrompt {
    id: string;
    name: string;
    template: string;
    variables: PromptVariable[];
    description: string;
}
export interface PromptVariable {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    default?: any;
    description: string;
}
export interface AgentParameters {
    creativityLevel: number;
    verbosityLevel: number;
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    optimizationFocus: 'speed' | 'quality' | 'maintainability' | 'performance';
    validationLevel: ValidationLevel;
    realityCheckLevel: 'strict' | 'moderate' | 'lenient';
}
export interface AgentConstraints {
    maxExecutionTime: number;
    maxMemoryUsage: number;
    prohibitedPatterns: string[];
    requiredPatterns: string[];
    codeQualityMinimum: CodeQualityLevel;
    securityMinimum: ValidationLevel;
    testCoverageMinimum: number;
}
export interface AgentIntegrations {
    github: GitHubIntegration;
    databases: DatabaseIntegration[];
    cloudProviders: CloudProviderIntegration[];
    monitoring: MonitoringIntegration[];
    deployment: DeploymentIntegration[];
}
export interface GitHubIntegration {
    enabled: boolean;
    webhooks: boolean;
    autoCommit: boolean;
    branchStrategy: 'main' | 'develop' | 'feature-branch';
    prTemplate?: string;
}
export interface DatabaseIntegration {
    type: string;
    connectionString?: string;
    ssl: boolean;
    migrations: boolean;
    seeding: boolean;
}
export interface CloudProviderIntegration {
    provider: string;
    services: string[];
    region: string;
    credentials: string;
}
export interface MonitoringIntegration {
    provider: string;
    metrics: string[];
    alerts: string[];
    dashboards: string[];
}
export interface DeploymentIntegration {
    platform: string;
    strategy: 'rolling' | 'blue-green' | 'canary';
    autoDeployment: boolean;
    rollbackStrategy: string;
}
export interface AgentPerformance {
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    qualityScore: number;
    userRating: number;
    feedbackCount: number;
    lastExecution: string;
    errorRate: number;
    performanceMetrics: PerformanceMetrics;
}
export interface PerformanceMetrics {
    codeQuality: QualityMetrics;
    generation: GenerationMetrics;
    validation: ValidationMetrics;
    userSatisfaction: SatisfactionMetrics;
}
export interface QualityMetrics {
    averageComplexity: number;
    maintainabilityIndex: number;
    testCoverage: number;
    bugDensity: number;
    codeReuse: number;
}
export interface GenerationMetrics {
    averageTime: number;
    linesOfCode: number;
    filesGenerated: number;
    dependenciesManaged: number;
    integrationSuccess: number;
}
export interface ValidationMetrics {
    passRate: number;
    falsePositives: number;
    falseNegatives: number;
    accuracyScore: number;
    realityCheckAccuracy: number;
}
export interface SatisfactionMetrics {
    overallRating: number;
    usabilityScore: number;
    accuracyRating: number;
    speedRating: number;
    recommendationScore: number;
}
export declare enum DesignPattern {
    SINGLETON = "singleton",
    FACTORY = "factory",
    OBSERVER = "observer",
    STRATEGY = "strategy",
    DECORATOR = "decorator",
    MVC = "mvc",
    MVVM = "mvvm",
    REPOSITORY = "repository",
    DEPENDENCY_INJECTION = "dependency-injection",
    COMMAND = "command"
}
export declare enum CodeQualityLevel {
    BASIC = "basic",
    GOOD = "good",
    EXCELLENT = "excellent",
    ENTERPRISE = "enterprise"
}
export interface CreateAgentRequest {
    name: string;
    description: string;
    role: AgentRole;
    capabilities: Partial<AgentCapabilities>;
    configuration: Partial<AgentConfiguration>;
    specializations: string[];
    supportedLanguages: string[];
    supportedFrameworks: string[];
    isPublic: boolean;
}
export interface UpdateAgentRequest {
    name?: string;
    description?: string;
    capabilities?: Partial<AgentCapabilities>;
    configuration?: Partial<AgentConfiguration>;
    specializations?: string[];
    supportedLanguages?: string[];
    supportedFrameworks?: string[];
    isPublic?: boolean;
}
//# sourceMappingURL=agent.d.ts.map