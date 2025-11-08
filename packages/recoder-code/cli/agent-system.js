#!/usr/bin/env node

/**
 * Agent System - Specialized AI agents for different tasks
 * Similar to Claude Code's agent routing system
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class AgentSystem {
  constructor(contextEngine, modelManager) {
    this.contextEngine = contextEngine;
    this.modelManager = modelManager;
    
    // Agent registry
    this.agents = new Map();
    
    // Agent execution history
    this.history = [];
    
    // Current active agent
    this.activeAgent = null;
    
    // Initialize built-in agents
    this.initializeBuiltInAgents();
  }

  /**
   * Initialize built-in specialized agents
   */
  initializeBuiltInAgents() {
    // 1. Coder Agent - For code generation and editing
    this.registerAgent({
      id: 'coder',
      name: 'Code Assistant',
      description: 'Specialized in writing, editing, and refactoring code',
      capabilities: ['code_generation', 'refactoring', 'debugging'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a specialized coding agent. Focus on:
- Writing clean, maintainable code
- Following project conventions
- Providing detailed explanations
- Suggesting best practices
- Debugging issues efficiently`,
      temperature: 0.2,
      priority: 10
    });

    // 2. Architect Agent - For system design and architecture
    this.registerAgent({
      id: 'architect',
      name: 'System Architect',
      description: 'Specialized in software architecture and design patterns',
      capabilities: ['architecture', 'design_patterns', 'system_design'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a system architect. Focus on:
- High-level system design
- Design patterns and best practices
- Scalability and performance
- Technology selection
- Architecture documentation`,
      temperature: 0.3,
      priority: 8
    });

    // 3. Debugger Agent - For finding and fixing bugs
    this.registerAgent({
      id: 'debugger',
      name: 'Debug Specialist',
      description: 'Specialized in identifying and fixing bugs',
      capabilities: ['debugging', 'error_analysis', 'testing'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a debugging specialist. Focus on:
- Analyzing error messages and stack traces
- Identifying root causes
- Suggesting fixes with explanations
- Preventing similar bugs
- Writing test cases`,
      temperature: 0.1,
      priority: 9
    });

    // 4. Documenter Agent - For writing documentation
    this.registerAgent({
      id: 'documenter',
      name: 'Documentation Writer',
      description: 'Specialized in writing clear documentation',
      capabilities: ['documentation', 'comments', 'readme'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a documentation specialist. Focus on:
- Clear, concise explanations
- User-friendly language
- Complete API documentation
- Usage examples
- Markdown formatting`,
      temperature: 0.4,
      priority: 6
    });

    // 5. Reviewer Agent - For code review
    this.registerAgent({
      id: 'reviewer',
      name: 'Code Reviewer',
      description: 'Specialized in code review and quality assurance',
      capabilities: ['code_review', 'quality_assurance', 'security'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a code reviewer. Focus on:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Best practices compliance
- Constructive feedback`,
      temperature: 0.2,
      priority: 7
    });

    // 6. Optimizer Agent - For performance optimization
    this.registerAgent({
      id: 'optimizer',
      name: 'Performance Optimizer',
      description: 'Specialized in code optimization and performance',
      capabilities: ['optimization', 'performance', 'profiling'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a performance optimization specialist. Focus on:
- Identifying bottlenecks
- Algorithm optimization
- Memory efficiency
- Caching strategies
- Profiling and benchmarking`,
      temperature: 0.2,
      priority: 7
    });

    // 7. Tester Agent - For writing tests
    this.registerAgent({
      id: 'tester',
      name: 'Test Engineer',
      description: 'Specialized in writing tests and test coverage',
      capabilities: ['testing', 'tdd', 'coverage'],
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: `You are a test engineer. Focus on:
- Writing comprehensive test suites
- Test-driven development
- Edge case coverage
- Integration testing
- Mocking and fixtures`,
      temperature: 0.3,
      priority: 7
    });

    console.log(chalk.gray(`✓ Registered ${this.agents.size} built-in agents`));
  }

  /**
   * Register a custom agent
   */
  registerAgent(config) {
    const agent = {
      id: config.id,
      name: config.name,
      description: config.description,
      capabilities: config.capabilities || [],
      model: config.model || 'anthropic/claude-3.5-sonnet',
      systemPrompt: config.systemPrompt || '',
      temperature: config.temperature || 0.3,
      priority: config.priority || 5,
      custom: config.custom || false,
      metadata: config.metadata || {}
    };

    this.agents.set(agent.id, agent);
    return agent;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  listAgents() {
    return Array.from(this.agents.values()).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Select best agent for a task based on intent analysis
   */
  selectAgent(userInput, context = {}) {
    const input = userInput.toLowerCase();
    
    // Keyword-based routing (simple but effective)
    const routes = {
      coder: ['write', 'create', 'implement', 'add', 'build', 'generate', 'code'],
      architect: ['design', 'architecture', 'structure', 'organize', 'pattern'],
      debugger: ['debug', 'fix', 'error', 'bug', 'issue', 'problem', 'broken'],
      documenter: ['document', 'docs', 'readme', 'comment', 'explain'],
      reviewer: ['review', 'check', 'audit', 'analyze', 'quality'],
      optimizer: ['optimize', 'performance', 'faster', 'speed', 'improve'],
      tester: ['test', 'testing', 'coverage', 'spec', 'unit test']
    };

    // Score each agent
    const scores = new Map();
    for (const [agentId, keywords] of Object.entries(routes)) {
      let score = 0;
      for (const keyword of keywords) {
        if (input.includes(keyword)) {
          score += 10;
        }
      }
      
      // Bonus for recent agent (sticky routing)
      if (this.activeAgent?.id === agentId) {
        score += 2;
      }
      
      scores.set(agentId, score);
    }

    // Get highest scoring agent
    let bestAgent = 'coder'; // default
    let bestScore = 0;
    
    for (const [agentId, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentId;
      }
    }

    const agent = this.agents.get(bestAgent);
    this.activeAgent = agent;
    
    return agent;
  }

  /**
   * Execute agent with given input
   */
  async execute(agentId, userInput, context = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const execution = {
      id: Date.now().toString(),
      agentId: agent.id,
      input: userInput,
      timestamp: Date.now(),
      context
    };

    this.history.push(execution);

    // Return agent config for model call
    return {
      agent,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      temperature: agent.temperature
    };
  }

  /**
   * Auto-route user input to best agent
   */
  async autoRoute(userInput, context = {}) {
    const agent = this.selectAgent(userInput, context);
    return this.execute(agent.id, userInput, context);
  }

  /**
   * Switch to specific agent
   */
  switchAgent(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return false;
    }
    
    this.activeAgent = agent;
    return true;
  }

  /**
   * Get active agent
   */
  getActiveAgent() {
    return this.activeAgent || this.agents.get('coder');
  }

  /**
   * Get execution history
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  /**
   * Get agent statistics
   */
  getStats() {
    const agentUsage = new Map();
    
    for (const execution of this.history) {
      const count = agentUsage.get(execution.agentId) || 0;
      agentUsage.set(execution.agentId, count + 1);
    }

    return {
      totalExecutions: this.history.length,
      agentUsage: Object.fromEntries(agentUsage),
      activeAgent: this.activeAgent?.id || 'none',
      registeredAgents: this.agents.size
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Get all agent capabilities
   */
  getCapabilities() {
    const capabilities = [];
    
    for (const [id, agent] of this.agents) {
      capabilities.push({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities || []
      });
    }
    
    return capabilities;
  }
}

module.exports = AgentSystem;
