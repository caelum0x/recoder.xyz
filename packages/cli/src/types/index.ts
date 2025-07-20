// Core types for Recoder CLI

export interface Agent {
  id: string;
  name: string;
  type: 'planner' | 'web' | 'blockchain' | 'ai' | 'mobile' | 'security' | 'performance' | 'custom';
  description: string;
  specialization: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'training';
  version: string;
  config: Record<string, any>;
  metadata: {
    created: Date;
    updated: Date;
    author: string;
    tags: string[];
  };
}

export interface Project {
  id: string;
  name: string;
  type: 'web' | 'blockchain' | 'ai' | 'mobile' | 'fullstack';
  description: string;
  status: 'planning' | 'generating' | 'validating' | 'completed' | 'failed';
  path: string;
  config: {
    framework: string;
    language: string;
    features: string[];
    integrations: string[];
  };
  plan?: ProjectPlan;
  generated?: GeneratedCode;
  validation?: ValidationResult;
  metadata: {
    created: Date;
    updated: Date;
    author: string;
  };
}

export interface ProjectPlan {
  id: string;
  description: string;
  architecture: {
    type: string;
    components: string[];
    dependencies: string[];
  };
  timeline: {
    estimated: number; // hours
    phases: Array<{
      name: string;
      description: string;
      duration: number;
      dependencies: string[];
    }>;
  };
  technologies: {
    frontend: string[];
    backend: string[];
    database: string[];
    deployment: string[];
  };
  features: Array<{
    name: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    complexity: number; // 1-10
  }>;
}

export interface GeneratedCode {
  id: string;
  projectId: string;
  files: Array<{
    path: string;
    content: string;
    type: 'source' | 'config' | 'documentation' | 'test';
    language: string;
  }>;
  structure: {
    directories: string[];
    totalFiles: number;
    totalLines: number;
  };
  metadata: {
    generated: Date;
    model: string;
    agent: string;
  };
}

export interface ValidationResult {
  id: string;
  projectId: string;
  status: 'passed' | 'failed' | 'warning';
  score: number; // 0-100
  tests: Array<{
    name: string;
    type: 'functionality' | 'security' | 'performance' | 'integration';
    status: 'passed' | 'failed' | 'skipped';
    message: string;
    details?: Record<string, any>;
  }>;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    type: string;
    message: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  metadata: {
    validated: Date;
    duration: number; // ms
  };
}

export interface AIProvider {
  name: 'claude' | 'openai' | 'gemini' | 'ollama';
  apiKey?: string;
  endpoint?: string;
  model: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface Config {
  providers: AIProvider[];
  defaultProvider: string;
  workspace: string;
  preferences: {
    verbose: boolean;
    autoValidate: boolean;
    realFunctionality: boolean;
  };
  cache: {
    enabled: boolean;
    ttl: number;
  };
}

export interface CLIOptions {
  verbose?: boolean;
  config?: string;
  provider?: string;
  model?: string;
  output?: string;
  force?: boolean;
}