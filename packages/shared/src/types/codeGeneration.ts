/**
 * Code generation and template-related type definitions
 */

export interface CodeGenerationOptions {
  outputDir: string;
  template: string;
  variables: Record<string, any>;
  skipExisting?: boolean;
  dryRun?: boolean;
  validate?: boolean;
  format?: boolean;
  overwrite?: boolean;
}

export interface CodeGenerationResult {
  success: boolean;
  generatedFiles: GeneratedFile[];
  errors: string[];
  warnings: string[];
  statistics: GenerationStatistics;
  metadata?: Record<string, any>;
}

export interface GeneratedFile {
  path: string;
  content: string;
  size: number;
  type: 'source' | 'test' | 'config' | 'documentation';
  language?: string;
  checksum?: string;
  generated: boolean;
  modified: boolean;
}

export interface GenerationStatistics {
  totalFiles: number;
  newFiles: number;
  modifiedFiles: number;
  skippedFiles: number;
  deletedFiles: number;
  totalSize: number;
  duration: number;
  linesOfCode: number;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  category: 'web' | 'mobile' | 'api' | 'library' | 'fullstack' | 'blockchain' | 'ai';
  subcategory?: string;
  tags: string[];
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  documentation?: string;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
  rating?: number;
  featured?: boolean;
}

export interface TemplateManifest {
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  license: string;
  engine: string;
  engineVersion: string;
  
  // Template structure
  entry?: string;
  files: string[];
  ignore?: string[];
  
  // Variables and configuration
  variables: TemplateVariable[];
  defaults?: Record<string, any>;
  
  // Dependencies and requirements
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  requirements?: TemplateRequirement[];
  
  // Hooks and scripts
  hooks?: TemplateHooks;
  scripts?: Record<string, string>;
  
  // Validation and constraints
  validation?: TemplateValidation;
  constraints?: TemplateConstraints;
  
  // Output configuration
  output?: TemplateOutput;
  
  // Metadata
  keywords?: string[];
  homepage?: string;
  repository?: string;
  bugs?: string;
  funding?: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'choice' | 'multiChoice';
  description: string;
  default?: any;
  required?: boolean;
  choices?: Array<{ value: any; label: string; description?: string }>;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    custom?: string;
  };
  conditions?: Array<{
    variable: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in';
    value: any;
  }>;
  group?: string;
  order?: number;
  hidden?: boolean;
}

export interface TemplateRequirement {
  type: 'node' | 'npm' | 'system' | 'service' | 'port';
  name: string;
  version?: string;
  description?: string;
  optional?: boolean;
  url?: string;
}

export interface TemplateHooks {
  preGenerate?: string[];
  postGenerate?: string[];
  preFile?: string[];
  postFile?: string[];
  preValidate?: string[];
  postValidate?: string[];
}

export interface TemplateValidation {
  strict?: boolean;
  validateSyntax?: boolean;
  validateDependencies?: boolean;
  validateVariables?: boolean;
  customValidators?: string[];
}

export interface TemplateConstraints {
  minNodeVersion?: string;
  maxNodeVersion?: string;
  supportedPlatforms?: string[];
  requiredFeatures?: string[];
  conflictsWith?: string[];
}

export interface TemplateOutput {
  structure?: 'flat' | 'nested' | 'custom';
  preserveTimestamps?: boolean;
  executable?: string[];
  permissions?: Record<string, string>;
  postProcess?: string[];
}

export interface TemplateContext {
  template: TemplateInfo;
  variables: Record<string, any>;
  outputDir: string;
  options: CodeGenerationOptions;
  utilities: TemplateUtilities;
  metadata: Record<string, any>;
}

export interface TemplateUtilities {
  // String utilities
  capitalize: (str: string) => string;
  camelCase: (str: string) => string;
  pascalCase: (str: string) => string;
  snakeCase: (str: string) => string;
  kebabCase: (str: string) => string;
  pluralize: (str: string) => string;
  singularize: (str: string) => string;
  
  // File utilities
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  copyFile: (source: string, destination: string) => void;
  mkdir: (path: string) => void;
  
  // Template utilities
  render: (template: string, variables: Record<string, any>) => string;
  include: (templatePath: string, variables?: Record<string, any>) => string;
  
  // Validation utilities
  validateEmail: (email: string) => boolean;
  validateURL: (url: string) => boolean;
  validateSemVer: (version: string) => boolean;
  
  // Date utilities
  now: () => Date;
  formatDate: (date: Date, format: string) => string;
  
  // Random utilities
  uuid: () => string;
  randomString: (length: number) => string;
  randomNumber: (min: number, max: number) => number;
}

export interface CodeQualityMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  technicalDebt: number;
  testCoverage?: number;
  duplicateCode?: number;
  issues: CodeIssue[];
  score: number;
}

export interface CodeIssue {
  severity: 'error' | 'warning' | 'info';
  type: 'syntax' | 'style' | 'performance' | 'security' | 'maintainability';
  rule: string;
  message: string;
  file: string;
  line: number;
  column: number;
  fix?: string;
}

export interface CodeFormatter {
  name: string;
  version: string;
  config: Record<string, any>;
  supportedLanguages: string[];
}

export interface CodeValidator {
  name: string;
  version: string;
  rules: string[];
  config: Record<string, any>;
  supportedLanguages: string[];
}

export interface BuildConfiguration {
  tool: 'webpack' | 'vite' | 'rollup' | 'parcel' | 'esbuild' | 'tsc' | 'babel' | 'custom';
  version?: string;
  config: Record<string, any>;
  commands: {
    build: string;
    dev: string;
    test?: string;
    lint?: string;
    format?: string;
  };
  targets?: string[];
  optimization?: {
    minify?: boolean;
    treeshake?: boolean;
    splitChunks?: boolean;
    compression?: boolean;
  };
}

export interface DeploymentConfiguration {
  provider: 'vercel' | 'netlify' | 'aws' | 'azure' | 'gcp' | 'docker' | 'kubernetes' | 'custom';
  config: Record<string, any>;
  environment: 'development' | 'staging' | 'production';
  domain?: string;
  ssl?: boolean;
  cdn?: boolean;
  database?: DatabaseConfiguration;
  storage?: StorageConfiguration;
  monitoring?: MonitoringConfiguration;
}

export interface DatabaseConfiguration {
  provider: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'sqlite' | 'dynamodb' | 'firestore';
  url?: string;
  config: Record<string, any>;
  migrations?: boolean;
  seeds?: boolean;
  backup?: boolean;
}

export interface StorageConfiguration {
  provider: 'aws-s3' | 'azure-blob' | 'gcp-storage' | 'cloudinary' | 'local';
  config: Record<string, any>;
  bucket?: string;
  region?: string;
  cdn?: boolean;
}

export interface MonitoringConfiguration {
  provider: 'datadog' | 'newrelic' | 'sentry' | 'logz' | 'elk' | 'custom';
  config: Record<string, any>;
  metrics?: boolean;
  logs?: boolean;
  traces?: boolean;
  alerts?: boolean;
}

export interface GenerationPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: Record<string, any>;
  options: CodeGenerationOptions;
  tags: string[];
  author: string;
  public: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface GenerationHistory {
  id: string;
  template: string;
  variables: Record<string, any>;
  options: CodeGenerationOptions;
  result: CodeGenerationResult;
  timestamp: string;
  duration: number;
  status: 'success' | 'failure' | 'partial';
  userId?: string;
  projectId?: string;
}