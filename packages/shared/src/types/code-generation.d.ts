/**
 * Code Generation Types and Interfaces
 */
import { Timestamp } from './common';
import { SecurityRequirement } from './project';
export declare enum GenerationType {
    GENERATE = "generate",
    MODIFY = "modify",
    REFACTOR = "refactor",
    FIX = "fix",
    OPTIMIZE = "optimize"
}
export declare enum ValidationLevel {
    BASIC = "basic",
    STANDARD = "standard",
    STRICT = "strict",
    ENTERPRISE = "enterprise"
}
export declare enum CodeQuality {
    PROTOTYPE = "prototype",
    DEVELOPMENT = "development",
    PRODUCTION = "production",
    ENTERPRISE = "enterprise"
}
export declare enum SecurityLevel {
    NONE = "none",
    BASIC = "basic",
    STANDARD = "standard",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum PerformanceTarget {
    BASIC = "basic",
    OPTIMIZED = "optimized",
    HIGH_PERFORMANCE = "high_performance",
    REAL_TIME = "real_time"
}
export interface GenerationRequest {
    type: GenerationType;
    description: string;
    context: GenerationContext;
    options: GenerationOptions;
    validation: ValidationOptions;
    targets: GenerationTargets;
}
export interface GenerationContext {
    project: ProjectContext;
    codebase: CodebaseContext;
    environment: EnvironmentContext;
    constraints: ContextConstraints;
}
export interface ProjectContext {
    name: string;
    type: string;
    version: string;
    rootPath: string;
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
    buildSystem: string;
    languages: string[];
    frameworks: string[];
    dependencies: Dependency[];
    devDependencies: Dependency[];
    architecture: ArchitectureInfo;
}
export interface CodebaseContext {
    fileStructure: FileStructure;
    existingCode: ExistingCodeInfo;
    patterns: CodePattern[];
    conventions: CodingConventions;
    documentation: DocumentationInfo;
}
export interface EnvironmentContext {
    nodeVersion?: string;
    runtimeEnvironment: 'browser' | 'node' | 'deno' | 'bun' | 'react-native';
    targetPlatforms: string[];
    deploymentTarget: string;
    environmentVariables: Record<string, string>;
}
export interface ContextConstraints {
    maxFileSize: number;
    maxFiles: number;
    allowedPatterns: string[];
    forbiddenPatterns: string[];
    requiredTesting: boolean;
    securityRequirements: SecurityRequirement[];
}
export interface GenerationOptions {
    quality: CodeQuality;
    security: SecurityLevel;
    performance: PerformanceTarget;
    testing: TestingOptions;
    documentation: DocumentationOptions;
    interactive: boolean;
    dryRun: boolean;
    backup: boolean;
    rollback: boolean;
}
export interface ValidationOptions {
    level: ValidationLevel;
    syntaxCheck: boolean;
    typeCheck: boolean;
    linting: boolean;
    securityScan: boolean;
    performanceCheck: boolean;
    integrationTest: boolean;
    realityCheck: RealityCheckOptions;
}
export interface RealityCheckOptions {
    enabled: boolean;
    mockDetection: boolean;
    apiValidation: boolean;
    databaseValidation: boolean;
    externalServiceCheck: boolean;
    dependencyVerification: boolean;
    functionalityTest: boolean;
}
export interface GenerationTargets {
    files: FileTarget[];
    tests: TestTarget[];
    documentation: DocumentationTarget[];
    configuration: ConfigurationTarget[];
}
export interface FileTarget {
    path: string;
    type: 'create' | 'modify' | 'replace';
    language: string;
    purpose: string;
    dependencies: string[];
    exports: string[];
    imports: string[];
}
export interface TestTarget {
    path: string;
    type: 'unit' | 'integration' | 'e2e';
    coverage: number;
    framework: string;
    scenarios: TestScenario[];
}
export interface TestScenario {
    description: string;
    setup: string[];
    assertions: string[];
    cleanup: string[];
}
export interface DocumentationTarget {
    path: string;
    type: 'api' | 'readme' | 'guide' | 'comment';
    format: 'markdown' | 'jsdoc' | 'openapi';
    content: string;
}
export interface ConfigurationTarget {
    path: string;
    type: 'package' | 'build' | 'env' | 'ci' | 'deploy';
    changes: ConfigurationChange[];
}
export interface ConfigurationChange {
    action: 'add' | 'update' | 'remove';
    key: string;
    value: any;
    reason: string;
}
export interface GenerationResult {
    id: string;
    request: GenerationRequest;
    status: GenerationStatus;
    files: GeneratedFile[];
    validation: ValidationResult;
    metrics: GenerationMetrics;
    errors: GenerationError[];
    warnings: GenerationWarning[];
    suggestions: GenerationSuggestion[];
    timestamp: Timestamp;
}
export declare enum GenerationStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    VALIDATING = "validating",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export interface GeneratedFile {
    path: string;
    content: string;
    originalContent?: string;
    language: string;
    type: 'source' | 'test' | 'config' | 'documentation';
    size: number;
    lines: number;
    changes: FileChange[];
    dependencies: FileDependency[];
    exports: FileExport[];
    imports: FileImport[];
}
export interface FileChange {
    type: 'addition' | 'modification' | 'deletion';
    lineStart: number;
    lineEnd: number;
    content: string;
    reason: string;
}
export interface FileDependency {
    name: string;
    version?: string;
    type: 'production' | 'development';
    source: 'npm' | 'local' | 'cdn';
    required: boolean;
}
export interface FileExport {
    name: string;
    type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'default';
    signature?: string;
    description?: string;
}
export interface FileImport {
    module: string;
    imports: string[];
    type: 'named' | 'default' | 'namespace';
    source: 'external' | 'local';
}
export interface ValidationResult {
    overall: ValidationStatus;
    syntax: SyntaxValidation;
    types: TypeValidation;
    security: SecurityValidation;
    performance: PerformanceValidation;
    functionality: FunctionalityValidation;
    integration: IntegrationValidation;
    reality: RealityValidation;
}
export declare enum ValidationStatus {
    PASSED = "passed",
    WARNING = "warning",
    FAILED = "failed",
    SKIPPED = "skipped"
}
export interface SyntaxValidation {
    status: ValidationStatus;
    errors: SyntaxError[];
    warnings: SyntaxWarning[];
    suggestions: SyntaxSuggestion[];
}
export interface TypeValidation {
    status: ValidationStatus;
    errors: TypeError[];
    warnings: TypeWarning[];
    coverage: number;
    strictness: 'loose' | 'strict' | 'very_strict';
}
export interface SecurityValidation {
    status: ValidationStatus;
    vulnerabilities: SecurityVulnerability[];
    risks: SecurityRisk[];
    compliance: ComplianceCheck[];
    score: number;
}
export interface SecurityVulnerability {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    description: string;
    location: CodeLocation;
    recommendation: string;
    cwe?: string;
}
export interface SecurityRisk {
    type: string;
    level: 'low' | 'medium' | 'high';
    description: string;
    mitigation: string[];
}
export interface ComplianceCheck {
    standard: string;
    status: 'compliant' | 'non_compliant' | 'partial';
    issues: string[];
    recommendations: string[];
}
export interface PerformanceValidation {
    status: ValidationStatus;
    metrics: PerformanceMetric[];
    bottlenecks: PerformanceBottleneck[];
    recommendations: PerformanceRecommendation[];
    score: number;
}
export interface PerformanceMetric {
    name: string;
    value: number;
    unit: string;
    target: number;
    status: 'good' | 'warning' | 'poor';
}
export interface PerformanceBottleneck {
    type: string;
    location: CodeLocation;
    impact: 'low' | 'medium' | 'high';
    description: string;
    solution: string;
}
export interface PerformanceRecommendation {
    type: string;
    priority: 'low' | 'medium' | 'high';
    description: string;
    implementation: string;
    estimatedGain: string;
}
export interface FunctionalityValidation {
    status: ValidationStatus;
    tests: FunctionalityTest[];
    coverage: number;
    mockDetection: MockDetectionResult;
    apiValidation: ApiValidationResult;
    databaseValidation: DatabaseValidationResult;
}
export interface FunctionalityTest {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
    expectations: TestExpectation[];
}
export interface TestExpectation {
    description: string;
    actual: any;
    expected: any;
    status: 'passed' | 'failed';
}
export interface MockDetectionResult {
    detected: boolean;
    locations: CodeLocation[];
    types: MockType[];
    suggestions: string[];
}
export declare enum MockType {
    FAKE_API = "fake_api",
    DUMMY_DATA = "dummy_data",
    PLACEHOLDER_LOGIC = "placeholder_logic",
    INCOMPLETE_IMPLEMENTATION = "incomplete_implementation"
}
export interface ApiValidationResult {
    endpoints: ApiEndpointValidation[];
    authentication: AuthenticationValidation;
    errorHandling: ErrorHandlingValidation;
    documentation: ApiDocumentationValidation;
}
export interface ApiEndpointValidation {
    endpoint: string;
    method: string;
    status: ValidationStatus;
    responseValidation: boolean;
    errorHandling: boolean;
    authentication: boolean;
    rateLimit: boolean;
}
export interface AuthenticationValidation {
    implemented: boolean;
    method: string[];
    secure: boolean;
    issues: string[];
}
export interface ErrorHandlingValidation {
    implemented: boolean;
    comprehensive: boolean;
    standardized: boolean;
    userFriendly: boolean;
    issues: string[];
}
export interface ApiDocumentationValidation {
    exists: boolean;
    complete: boolean;
    upToDate: boolean;
    format: string;
    issues: string[];
}
export interface DatabaseValidationResult {
    connections: DatabaseConnectionValidation[];
    queries: DatabaseQueryValidation[];
    migrations: DatabaseMigrationValidation;
    security: DatabaseSecurityValidation;
}
export interface DatabaseConnectionValidation {
    type: string;
    configured: boolean;
    secure: boolean;
    pooling: boolean;
    issues: string[];
}
export interface DatabaseQueryValidation {
    query: string;
    optimized: boolean;
    secure: boolean;
    indexed: boolean;
    performance: 'good' | 'moderate' | 'poor';
    suggestions: string[];
}
export interface DatabaseMigrationValidation {
    exists: boolean;
    reversible: boolean;
    safe: boolean;
    documented: boolean;
    issues: string[];
}
export interface DatabaseSecurityValidation {
    encryption: boolean;
    accessControl: boolean;
    sqlInjectionProtection: boolean;
    auditLogging: boolean;
    issues: string[];
}
export interface IntegrationValidation {
    status: ValidationStatus;
    dependencies: DependencyValidation[];
    services: ServiceIntegrationValidation[];
    apis: ExternalApiValidation[];
    configuration: ConfigurationValidation;
}
export interface DependencyValidation {
    name: string;
    version: string;
    status: 'valid' | 'outdated' | 'vulnerable' | 'missing';
    issues: string[];
    recommendations: string[];
}
export interface ServiceIntegrationValidation {
    service: string;
    status: ValidationStatus;
    connectivity: boolean;
    authentication: boolean;
    errorHandling: boolean;
    issues: string[];
}
export interface ExternalApiValidation {
    api: string;
    status: ValidationStatus;
    reachable: boolean;
    authenticated: boolean;
    responseValidation: boolean;
    errorHandling: boolean;
    rateLimit: boolean;
    issues: string[];
}
export interface ConfigurationValidation {
    status: ValidationStatus;
    environment: EnvironmentValidation;
    build: BuildValidation;
    deployment: DeploymentValidation;
    issues: string[];
}
export interface EnvironmentValidation {
    variables: EnvironmentVariableValidation[];
    secrets: SecretValidation[];
    complete: boolean;
    secure: boolean;
}
export interface EnvironmentVariableValidation {
    name: string;
    required: boolean;
    present: boolean;
    type: 'string' | 'number' | 'boolean' | 'json';
    secure: boolean;
}
export interface SecretValidation {
    name: string;
    encrypted: boolean;
    rotatable: boolean;
    scope: 'development' | 'staging' | 'production';
    issues: string[];
}
export interface BuildValidation {
    configured: boolean;
    optimized: boolean;
    tested: boolean;
    documented: boolean;
    issues: string[];
}
export interface DeploymentValidation {
    configured: boolean;
    secure: boolean;
    scalable: boolean;
    monitored: boolean;
    rollbackCapable: boolean;
    issues: string[];
}
export interface RealityValidation {
    status: ValidationStatus;
    realFunctionality: boolean;
    externalIntegrations: ExternalIntegrationCheck[];
    dataFlow: DataFlowValidation;
    businessLogic: BusinessLogicValidation;
    userExperience: UserExperienceValidation;
}
export interface ExternalIntegrationCheck {
    name: string;
    type: 'api' | 'database' | 'service' | 'library';
    real: boolean;
    functional: boolean;
    tested: boolean;
    documented: boolean;
    issues: string[];
}
export interface DataFlowValidation {
    complete: boolean;
    consistent: boolean;
    validated: boolean;
    errorHandled: boolean;
    secure: boolean;
    issues: string[];
}
export interface BusinessLogicValidation {
    implemented: boolean;
    tested: boolean;
    documented: boolean;
    maintainable: boolean;
    scalable: boolean;
    issues: string[];
}
export interface UserExperienceValidation {
    responsive: boolean;
    accessible: boolean;
    intuitive: boolean;
    errorHandling: boolean;
    performance: boolean;
    issues: string[];
}
export interface GenerationMetrics {
    duration: number;
    filesGenerated: number;
    linesOfCode: number;
    testsGenerated: number;
    testCoverage: number;
    complexityScore: number;
    maintainabilityIndex: number;
    qualityScore: number;
    securityScore: number;
    performanceScore: number;
    realityScore: number;
}
export interface GenerationError {
    code: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    location?: CodeLocation;
    suggestions: string[];
    recoverable: boolean;
}
export interface GenerationWarning {
    code: string;
    message: string;
    location?: CodeLocation;
    suggestion: string;
}
export interface GenerationSuggestion {
    type: 'improvement' | 'alternative' | 'optimization' | 'best_practice';
    description: string;
    implementation: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
}
export interface CodeLocation {
    file: string;
    line: number;
    column: number;
    length?: number;
}
export interface Dependency {
    name: string;
    version: string;
    type: 'production' | 'development';
    purpose: string;
}
export interface ArchitectureInfo {
    pattern: string;
    layers: string[];
    dataFlow: string;
    scalability: string;
}
export interface FileStructure {
    directories: DirectoryInfo[];
    files: FileInfo[];
    patterns: StructurePattern[];
}
export interface DirectoryInfo {
    path: string;
    purpose: string;
    fileCount: number;
    conventions: string[];
}
export interface FileInfo {
    path: string;
    type: string;
    size: number;
    language: string;
    purpose: string;
    dependencies: string[];
    exports: string[];
}
export interface StructurePattern {
    name: string;
    description: string;
    examples: string[];
}
export interface ExistingCodeInfo {
    totalFiles: number;
    totalLines: number;
    languages: LanguageInfo[];
    frameworks: FrameworkInfo[];
    patterns: CodePattern[];
    quality: CodeQualityMetrics;
}
export interface LanguageInfo {
    name: string;
    version: string;
    fileCount: number;
    lineCount: number;
    percentage: number;
}
export interface FrameworkInfo {
    name: string;
    version: string;
    usage: string;
    configuration: string[];
}
export interface CodePattern {
    name: string;
    type: 'design' | 'architectural' | 'naming' | 'structure';
    description: string;
    examples: string[];
    frequency: number;
}
export interface CodingConventions {
    indentation: 'spaces' | 'tabs';
    indentSize: number;
    lineLength: number;
    namingConvention: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case';
    quotingStyle: 'single' | 'double';
    semicolons: boolean;
    trailingCommas: boolean;
    bracketStyle: 'same-line' | 'new-line';
}
export interface DocumentationInfo {
    exists: boolean;
    coverage: number;
    format: string[];
    upToDate: boolean;
    quality: 'poor' | 'fair' | 'good' | 'excellent';
}
export interface TestingOptions {
    generate: boolean;
    framework: string;
    coverage: number;
    types: ('unit' | 'integration' | 'e2e')[];
    mocking: 'minimal' | 'moderate' | 'extensive';
}
export interface DocumentationOptions {
    generate: boolean;
    types: ('inline' | 'api' | 'readme' | 'guides')[];
    format: 'markdown' | 'jsdoc' | 'openapi';
    detail: 'minimal' | 'standard' | 'comprehensive';
}
export interface CodeQualityMetrics {
    complexity: number;
    maintainability: number;
    testCoverage: number;
    duplication: number;
    debt: number;
}
export type SyntaxError = GenerationError;
export type SyntaxWarning = GenerationWarning;
export type SyntaxSuggestion = GenerationSuggestion;
export type TypeError = GenerationError;
export type TypeWarning = GenerationWarning;
export interface InteractiveSession {
    id: string;
    request: GenerationRequest;
    steps: InteractiveStep[];
    currentStep: number;
    userChoices: UserChoice[];
    status: 'active' | 'paused' | 'completed' | 'cancelled';
}
export interface InteractiveStep {
    id: string;
    type: 'confirmation' | 'choice' | 'input' | 'review';
    title: string;
    description: string;
    options?: StepOption[];
    preview?: GenerationPreview;
    required: boolean;
}
export interface StepOption {
    id: string;
    title: string;
    description: string;
    impact: string;
    recommended: boolean;
}
export interface UserChoice {
    stepId: string;
    optionId?: string;
    input?: string;
    timestamp: Date;
}
export interface GenerationPreview {
    files: PreviewFile[];
    changes: PreviewChange[];
    impact: ImpactAnalysis;
}
export interface PreviewFile {
    path: string;
    type: 'create' | 'modify' | 'delete';
    preview: string;
    size: number;
}
export interface PreviewChange {
    file: string;
    type: 'addition' | 'modification' | 'deletion';
    line: number;
    content: string;
    reason: string;
}
export interface ImpactAnalysis {
    filesAffected: number;
    linesChanged: number;
    dependenciesAdded: string[];
    testCoverageChange: number;
    riskLevel: 'low' | 'medium' | 'high';
    estimatedTime: number;
}
//# sourceMappingURL=code-generation.d.ts.map