/**
 * Validation-related type definitions
 */

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data?: any;
  metadata?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
  value?: any;
  expected?: any;
  path?: string;
  constraint?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code?: string;
  value?: any;
  suggestion?: string;
  path?: string;
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: ValidationFieldType;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
  choices?: any[];
  custom?: ValidationCustomRule;
  conditions?: ValidationCondition[];
  group?: string;
  order?: number;
  description?: string;
  example?: any;
}

export type ValidationFieldType = 
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'email'
  | 'url'
  | 'uuid'
  | 'date'
  | 'datetime'
  | 'time'
  | 'json'
  | 'semver'
  | 'ip'
  | 'mac'
  | 'slug'
  | 'color'
  | 'file'
  | 'image';

export interface ValidationCustomRule {
  validator: (value: any, data: any) => boolean | string | Promise<boolean | string>;
  message?: string;
  async?: boolean;
}

export interface ValidationCondition {
  field: string;
  operator: ValidationOperator;
  value: any;
  logic?: 'and' | 'or';
}

export type ValidationOperator = 
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches'
  | 'not_matches'
  | 'exists'
  | 'not_exists'
  | 'empty'
  | 'not_empty';

export interface ValidationSchema {
  name: string;
  version: string;
  description?: string;
  rules: ValidationRule[];
  groups?: ValidationGroup[];
  metadata?: Record<string, any>;
}

export interface ValidationGroup {
  name: string;
  description?: string;
  rules: string[];
  conditions?: ValidationCondition[];
  optional?: boolean;
}

export interface ValidationOptions {
  strict?: boolean;
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  skipMissing?: boolean;
  context?: Record<string, any>;
  async?: boolean;
}

export interface ValidationContext {
  data: any;
  schema: ValidationSchema;
  options: ValidationOptions;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: Record<string, any>;
}

export interface ValidatorConfig {
  name: string;
  version: string;
  description?: string;
  rules: Record<string, ValidationRule>;
  presets: Record<string, ValidationSchema>;
  formatters: Record<string, ValidationFormatter>;
  transformers: Record<string, ValidationTransformer>;
}

export interface ValidationFormatter {
  name: string;
  format: (value: any) => string;
  validate?: (value: any) => boolean;
}

export interface ValidationTransformer {
  name: string;
  transform: (value: any) => any;
  validate?: (value: any) => boolean;
}

export interface ValidationProfile {
  id: string;
  name: string;
  description: string;
  schemas: string[];
  rules: ValidationRule[];
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationReport {
  id: string;
  timestamp: string;
  duration: number;
  schema: string;
  data: any;
  result: ValidationResult;
  statistics: ValidationStatistics;
  metadata?: Record<string, any>;
}

export interface ValidationStatistics {
  totalRules: number;
  passedRules: number;
  failedRules: number;
  skippedRules: number;
  totalErrors: number;
  totalWarnings: number;
  coverage: number;
  performance: {
    totalTime: number;
    averageTime: number;
    slowestRule: string;
    fastestRule: string;
  };
}

export interface ValidationCache {
  key: string;
  result: ValidationResult;
  timestamp: number;
  ttl: number;
  metadata?: Record<string, any>;
}

export interface ValidationMetrics {
  totalValidations: number;
  successRate: number;
  errorRate: number;
  averageTime: number;
  cacheHitRate: number;
  popularSchemas: Array<{
    name: string;
    usage: number;
    successRate: number;
  }>;
  commonErrors: Array<{
    code: string;
    message: string;
    count: number;
  }>;
}

export interface RealityCheckResult {
  feasible: boolean;
  confidence: number;
  complexityScore: number;
  timeEstimate: {
    minimum: number;
    maximum: number;
    recommended: number;
    unit: 'hours' | 'days' | 'weeks' | 'months';
  };
  resourceRequirements: {
    developers: number;
    skillLevel: 'junior' | 'mid' | 'senior' | 'expert';
    technologies: string[];
  };
  risks: RiskAssessment[];
  recommendations: Recommendation[];
  alternatives: Alternative[];
}

export interface RiskAssessment {
  category: 'technical' | 'business' | 'timeline' | 'resource' | 'integration';
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  probability: number;
  mitigation: string[];
}

export interface Recommendation {
  type: 'optimization' | 'simplification' | 'phasing' | 'technology' | 'process';
  priority: 'low' | 'medium' | 'high';
  description: string;
  rationale: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface Alternative {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  complexity: number;
  timeEstimate: number;
  cost: number;
  feasibility: number;
}

export interface CompatibilityCheck {
  compatible: boolean;
  issues: CompatibilityIssue[];
  warnings: CompatibilityWarning[];
  recommendations: string[];
  score: number;
}

export interface CompatibilityIssue {
  type: 'version' | 'dependency' | 'platform' | 'feature' | 'license';
  severity: 'error' | 'warning' | 'info';
  description: string;
  affected: string[];
  resolution?: string;
}

export interface CompatibilityWarning {
  type: 'deprecated' | 'experimental' | 'performance' | 'security';
  description: string;
  affected: string[];
  suggestion?: string;
}

export interface QualityGate {
  id: string;
  name: string;
  description: string;
  criteria: QualityCriteria[];
  threshold: number;
  required: boolean;
  category: 'code' | 'security' | 'performance' | 'maintainability' | 'reliability';
}

export interface QualityCriteria {
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equal_to' | 'not_equal_to';
  value: number;
  weight: number;
  description: string;
}

export interface QualityReport {
  id: string;
  timestamp: string;
  overall: QualityScore;
  gates: QualityGateResult[];
  metrics: QualityMetrics;
  recommendations: QualityRecommendation[];
  trends: QualityTrend[];
}

export interface QualityScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  breakdown: Record<string, number>;
}

export interface QualityGateResult {
  gate: QualityGate;
  passed: boolean;
  score: number;
  details: QualityCriteriaResult[];
}

export interface QualityCriteriaResult {
  criteria: QualityCriteria;
  passed: boolean;
  actual: number;
  expected: number;
  impact: number;
}

export interface QualityMetrics {
  codeQuality: number;
  security: number;
  performance: number;
  maintainability: number;
  reliability: number;
  testCoverage: number;
  documentation: number;
  complexity: number;
}

export interface QualityRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  automated: boolean;
}

export interface QualityTrend {
  metric: string;
  direction: 'improving' | 'stable' | 'degrading';
  change: number;
  period: string;
  significance: 'low' | 'medium' | 'high';
}