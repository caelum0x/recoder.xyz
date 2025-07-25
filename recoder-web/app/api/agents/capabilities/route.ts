/**
 * Agent Capabilities API for Recoder.xyz
 * 
 * Returns available AI agent capabilities and their specifications
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const capabilities = [
      {
        name: 'Code Analysis Agent',
        description: 'Analyze code for issues, patterns, security vulnerabilities, and optimization opportunities using advanced static analysis',
        models: ['moonshot/kimi-k2', 'deepseek/deepseek-r1'],
        tools: ['analyze_code', 'read_file', 'research_topic', 'assess_code_quality'],
        useCases: [
          'security audit', 
          'performance analysis', 
          'code review', 
          'technical debt assessment',
          'architecture evaluation'
        ],
        complexity: 'medium',
        estimatedCost: '$0.02-0.08 per analysis',
        averageTime: '2-5 minutes'
      },
      {
        name: 'Research Agent',
        description: 'Conduct comprehensive technical research with multi-source analysis, trend identification, and evidence-based recommendations',
        models: ['moonshot/kimi-k2', 'anthropic/claude-3.5-sonnet'],
        tools: ['research_topic', 'make_decision', 'analyze_repository'],
        useCases: [
          'technology research', 
          'best practices discovery', 
          'architecture decisions',
          'competitive analysis',
          'trend analysis'
        ],
        complexity: 'high',
        estimatedCost: '$0.05-0.15 per research',
        averageTime: '3-8 minutes'
      },
      {
        name: 'Code Generation Agent',
        description: 'Generate production-ready code with comprehensive testing, documentation, and optimization using repository-scale understanding',
        models: ['qwen/qwen-3-coder-480b', 'moonshot/kimi-k2'],
        tools: ['generate_code', 'analyze_code', 'research_topic', 'create_implementation_plan'],
        useCases: [
          'feature development', 
          'refactoring', 
          'automation scripts',
          'API development',
          'database schema design'
        ],
        complexity: 'high',
        estimatedCost: '$0.03-0.12 per generation',
        averageTime: '2-6 minutes'
      },
      {
        name: 'Decision Making Agent',
        description: 'Make informed technical decisions using transparent reasoning, risk assessment, and multi-criteria analysis',
        models: ['deepseek/deepseek-r1', 'moonshot/kimi-k2'],
        tools: ['make_decision', 'research_topic', 'analyze_code', 'make_architecture_decision'],
        useCases: [
          'architecture decisions', 
          'technology selection', 
          'optimization strategies',
          'resource planning',
          'risk assessment'
        ],
        complexity: 'high',
        estimatedCost: '$0.04-0.10 per decision',
        averageTime: '3-7 minutes'
      },
      {
        name: 'Repository Analysis Agent',
        description: 'Comprehensive repository analysis including dependency mapping, architecture review, and improvement recommendations',
        models: ['moonshot/kimi-k2'],
        tools: ['analyze_repository', 'assess_code_quality', 'research_technical_solution', 'make_architecture_decision'],
        useCases: [
          'codebase audit',
          'migration planning',
          'dependency analysis',
          'architecture review',
          'technical debt assessment'
        ],
        complexity: 'high',
        estimatedCost: '$0.08-0.25 per analysis',
        averageTime: '5-15 minutes'
      },
      {
        name: 'Multi-Agent Coordinator',
        description: 'Orchestrate multiple specialized agents for complex workflows requiring diverse expertise and tool combinations',
        models: ['moonshot/kimi-k2', 'deepseek/deepseek-r1'],
        tools: [
          'analyze_repository', 
          'generate_code', 
          'research_topic', 
          'make_decision',
          'assess_code_quality',
          'create_implementation_plan'
        ],
        useCases: [
          'end-to-end development',
          'complex problem solving',
          'multi-phase projects',
          'comprehensive analysis',
          'autonomous development'
        ],
        complexity: 'high',
        estimatedCost: '$0.15-0.50 per workflow',
        averageTime: '10-30 minutes'
      }
    ];

    return NextResponse.json(capabilities);

  } catch (error) {
    console.error('Error fetching agent capabilities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}