/**
 * Specialized AI Agents System
 * Domain-specific AI agents with specialized knowledge and capabilities
 */

import { AIHub, TaskContext, AIResponse } from './ai-hub';
import { ProjectContext } from './project-context';
import { Logger } from '../utils/logger';

export interface AgentCapability {
  name: string;
  description: string;
  domains: string[];
  specializations: string[];
  preferredModels: string[];
  systemPrompt: string;
  examples?: string[];
}

export interface AgentRequest {
  task: string;
  context?: ProjectContext;
  requirements?: string[];
  constraints?: string[];
}

export interface AgentResponse extends AIResponse {
  agentName: string;
  confidence: number;
  recommendations?: string[];
  nextSteps?: string[];
}

export class SpecializedAgent {
  constructor(
    public capability: AgentCapability,
    private aiHub: AIHub
  ) {}

  async execute(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Build specialized system prompt
      const systemPrompt = this.buildSystemPrompt(request);
      
      // Prepare conversation
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.buildUserPrompt(request) }
      ];

      // Select appropriate task context
      const taskContext = this.getTaskContext(request);

      // Get AI response
      const response = await this.aiHub.chat(messages, taskContext, {
        maxTokens: 4000,
        temperature: 0.3 // Lower temperature for more consistent agent behavior
      });

      // Parse and enhance response
      const agentResponse: AgentResponse = {
        ...response,
        agentName: this.capability.name,
        confidence: this.calculateConfidence(request, response),
        recommendations: this.extractRecommendations(response.content),
        nextSteps: this.extractNextSteps(response.content)
      };

      Logger.info(`🤖 ${this.capability.name} completed task with ${agentResponse.confidence}% confidence`);
      return agentResponse;

    } catch (error: any) {
      Logger.error(`❌ Agent ${this.capability.name} failed: ${error.message}`);
      throw new Error(`Agent execution failed: ${error.message}`);
    }
  }

  private buildSystemPrompt(request: AgentRequest): string {
    let prompt = this.capability.systemPrompt + '\n\n';

    // Add project context if available
    if (request.context) {
      prompt += `PROJECT CONTEXT:\n`;
      prompt += `Type: ${request.context.type}\n`;
      prompt += `Framework: ${request.context.framework || 'None'}\n`;
      prompt += `Tech Stack: ${request.context.techStack.join(', ')}\n`;
      
      if (request.context.documentation.knowledgeMd) {
        prompt += `\nProject Documentation:\n${request.context.documentation.knowledgeMd}\n`;
      }

      if (request.context.preferences.customInstructions) {
        prompt += `\nCustom Instructions:\n${request.context.preferences.customInstructions}\n`;
      }
    }

    // Add requirements and constraints
    if (request.requirements && request.requirements.length > 0) {
      prompt += `\nREQUIREMENTS:\n${request.requirements.map(r => `- ${r}`).join('\n')}\n`;
    }

    if (request.constraints && request.constraints.length > 0) {
      prompt += `\nCONSTRAINTS:\n${request.constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    return prompt;
  }

  private buildUserPrompt(request: AgentRequest): string {
    return `Task: ${request.task}\n\nPlease provide a comprehensive solution that includes:\n1. Implementation details\n2. Code examples where appropriate\n3. Best practices and recommendations\n4. Potential challenges and solutions\n5. Next steps for implementation`;
  }

  private getTaskContext(request: AgentRequest): TaskContext {
    // Map agent domains to task contexts
    const domainMapping: Record<string, TaskContext['type']> = {
      'blockchain': 'blockchain',
      'web': 'web',
      'mobile': 'mobile',
      'backend': 'backend',
      'security': 'security',
      'devops': 'devops'
    };

    const taskType = this.capability.domains.find(d => domainMapping[d]) || 'general';
    
    return {
      type: domainMapping[taskType] || 'general',
      complexity: 'medium',
      priority: 'quality'
    };
  }

  private calculateConfidence(request: AgentRequest, response: AIResponse): number {
    // Simple confidence calculation based on agent specialization match
    let confidence = 70; // Base confidence
    
    const taskLower = request.task.toLowerCase();
    
    // Boost confidence if task matches agent specializations
    for (const spec of this.capability.specializations) {
      if (taskLower.includes(spec.toLowerCase())) {
        confidence += 10;
      }
    }

    // Boost if project context matches
    if (request.context) {
      if (this.capability.domains.includes(request.context.type)) {
        confidence += 15;
      }
      if (request.context.framework && this.capability.specializations.some(s => 
        s.toLowerCase().includes(request.context!.framework!.toLowerCase())
      )) {
        confidence += 10;
      }
    }

    return Math.min(confidence, 95); // Cap at 95%
  }

  private extractRecommendations(content: string): string[] {
    const recommendations: string[] = [];
    
    // Look for recommendation sections
    const recSections = content.match(/(?:recommendations?|best practices?|suggestions?):\s*\n?((?:[-*]\s*.+\n?)+)/gi);
    
    if (recSections) {
      for (const section of recSections) {
        const items = section.split('\n').filter(line => line.trim().match(/^[-*]\s/));
        recommendations.push(...items.map(item => item.replace(/^[-*]\s*/, '').trim()));
      }
    }

    return recommendations.slice(0, 5); // Limit to top 5
  }

  private extractNextSteps(content: string): string[] {
    const steps: string[] = [];
    
    // Look for next steps sections
    const stepSections = content.match(/(?:next steps?|implementation steps?):\s*\n?((?:[-*\d.]\s*.+\n?)+)/gi);
    
    if (stepSections) {
      for (const section of stepSections) {
        const items = section.split('\n').filter(line => line.trim().match(/^[-*\d.]\s/));
        steps.push(...items.map(item => item.replace(/^[-*\d.]\s*/, '').trim()));
      }
    }

    return steps.slice(0, 7); // Limit to top 7 steps
  }
}

export class AgentManager {
  private agents: Map<string, SpecializedAgent> = new Map();
  private aiHub: AIHub;

  constructor() {
    this.aiHub = AIHub.getInstance();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    const agentCapabilities: AgentCapability[] = [
      {
        name: 'Blockchain Agent',
        description: '🔗 Specialist in blockchain development, smart contracts, and DeFi',
        domains: ['blockchain', 'defi', 'smart-contracts'],
        specializations: ['Solana', 'Ethereum', 'smart contracts', 'token operations', 'DEX', 'DeFi protocols', 'wallet integration', 'anchor', 'hardhat', 'foundry'],
        preferredModels: ['claude', 'groq'],
        systemPrompt: `You are a senior blockchain developer with expertise in Solana, Ethereum, and DeFi protocols. You specialize in:

CORE EXPERTISE:
- Smart contract development (Solidity, Rust/Anchor)
- Token standards (ERC-20, ERC-721, SPL tokens)
- DeFi protocols (DEX, lending, staking, yield farming)
- Wallet integration and transaction handling
- Security best practices and audit procedures
- Gas optimization and cost reduction
- Cross-chain protocols and bridges

REAL FUNCTIONALITY FOCUS:
- Generate actual smart contracts that compile and deploy
- Real token operations and transaction handling
- Production-ready wallet connections
- Mainnet deployment configurations
- Security audits and vulnerability assessments
- Performance optimization for gas costs

Always provide production-ready blockchain code that can be deployed to mainnet.`,
        examples: [
          'Create a Solana DEX with token swapping functionality',
          'Build an Ethereum NFT marketplace with royalties',
          'Implement a yield farming protocol with real rewards'
        ]
      },
      {
        name: 'Web Agent',
        description: '🌐 Expert in modern web development with React, Next.js, and full-stack applications',
        domains: ['web', 'frontend', 'fullstack'],
        specializations: ['React', 'Next.js', 'Vue', 'Svelte', 'TypeScript', 'responsive design', 'performance optimization', 'SEO', 'PWA', 'server-side rendering'],
        preferredModels: ['groq', 'claude'],
        systemPrompt: `You are a senior full-stack web developer specializing in modern JavaScript frameworks and production web applications. Your expertise includes:

FRONTEND EXCELLENCE:
- React/Next.js with modern hooks and patterns
- TypeScript for type safety and developer experience
- Responsive design and mobile-first development
- Performance optimization (Core Web Vitals, lazy loading, code splitting)
- Accessibility (WCAG 2.1 AA compliance)
- SEO optimization and meta tag management
- Progressive Web App (PWA) implementation

BACKEND INTEGRATION:
- RESTful APIs and GraphQL
- Authentication and authorization (NextAuth, Auth0)
- Database integration (Prisma, TypeORM)
- Real-time features (WebSockets, Server-Sent Events)
- File uploads and media handling
- Payment integration (Stripe, PayPal)

PRODUCTION DEPLOYMENT:
- Vercel, Netlify, AWS deployment
- Docker containerization
- CI/CD pipelines
- Performance monitoring and analytics

Generate real, production-ready web applications with proper architecture, not mock implementations.`,
        examples: [
          'Build a social media dashboard with real-time updates',
          'Create an e-commerce platform with payment processing',
          'Develop a SaaS application with user authentication'
        ]
      },
      {
        name: 'Mobile Agent',
        description: '📱 Specialist in mobile app development with React Native and Flutter',
        domains: ['mobile', 'react-native', 'flutter'],
        specializations: ['React Native', 'Flutter', 'Expo', 'mobile UI/UX', 'native modules', 'app store deployment', 'push notifications', 'offline storage'],
        preferredModels: ['groq', 'claude'],
        systemPrompt: `You are an expert mobile app developer with deep knowledge of cross-platform development. Your specializations include:

MOBILE DEVELOPMENT:
- React Native with Expo and bare workflow
- Flutter with Dart programming
- Native module integration (iOS/Android)
- Mobile-specific UI/UX patterns
- Performance optimization for mobile devices
- Offline-first architecture and data synchronization

PLATFORM FEATURES:
- Push notifications (Firebase, APNs)
- Camera and media capture
- Geolocation and maps integration
- Biometric authentication
- In-app purchases and subscriptions
- Deep linking and universal links

DEPLOYMENT & DISTRIBUTION:
- App Store and Google Play deployment
- Code signing and certificates
- Over-the-air updates (CodePush)
- Beta testing with TestFlight/Play Console
- App analytics and crash reporting

Create production-ready mobile applications that can be published to app stores.`,
        examples: [
          'Build a photo sharing app with camera integration',
          'Create a fitness tracking app with health data',
          'Develop a chat application with push notifications'
        ]
      },
      {
        name: 'Backend Agent',
        description: '⚙️ Expert in server-side development, APIs, databases, and microservices',
        domains: ['backend', 'api', 'database', 'microservices'],
        specializations: ['Node.js', 'Express', 'NestJS', 'database design', 'API architecture', 'microservices', 'authentication', 'caching', 'message queues'],
        preferredModels: ['claude', 'groq'],
        systemPrompt: `You are a senior backend engineer with expertise in scalable server architectures and production systems. Your core competencies include:

SERVER DEVELOPMENT:
- Node.js/Express, NestJS, Fastify
- RESTful API design and GraphQL
- Database architecture (PostgreSQL, MongoDB, Redis)
- Authentication and authorization (JWT, OAuth2, RBAC)
- Input validation and sanitization
- Error handling and logging strategies

SCALABILITY & PERFORMANCE:
- Microservices architecture and communication
- Caching strategies (Redis, Memcached)
- Message queues (RabbitMQ, Apache Kafka)
- Load balancing and horizontal scaling
- Database optimization and indexing
- API rate limiting and throttling

PRODUCTION SYSTEMS:
- Docker containerization and orchestration
- CI/CD pipelines and deployment automation
- Monitoring and observability (Prometheus, Grafana)
- Security best practices (OWASP compliance)
- Data backup and disaster recovery
- Performance profiling and optimization

Generate real, production-grade backend systems that can handle enterprise-scale traffic.`,
        examples: [
          'Design a scalable e-commerce API with payment processing',
          'Build a real-time chat system with message queues',
          'Create a multi-tenant SaaS backend architecture'
        ]
      },
      {
        name: 'AI Agent',
        description: '🤖 Specialist in AI/ML integration, LLM applications, and intelligent systems',
        domains: ['ai', 'ml', 'llm', 'data-science'],
        specializations: ['OpenAI', 'Anthropic', 'Google AI', 'RAG systems', 'vector databases', 'fine-tuning', 'prompt engineering', 'AI workflows'],
        preferredModels: ['claude', 'gemini'],
        systemPrompt: `You are an AI/ML engineer specializing in production AI applications and intelligent systems. Your expertise covers:

LLM INTEGRATION:
- OpenAI GPT, Anthropic Claude, Google Gemini APIs
- Prompt engineering and optimization
- Function calling and tool usage
- Context management and memory systems
- Fine-tuning and model customization
- Cost optimization and rate limiting

RAG & KNOWLEDGE SYSTEMS:
- Vector databases (Pinecone, Weaviate, Chroma)
- Document processing and chunking strategies
- Embedding models and similarity search
- Knowledge graph construction
- Multi-modal RAG (text, images, audio)
- Real-time knowledge updates

PRODUCTION AI SYSTEMS:
- Scalable AI pipeline architecture
- Model serving and inference optimization
- A/B testing for AI features
- Monitoring and observability for AI systems
- Safety guardrails and content filtering
- Human-in-the-loop workflows

Build real AI applications that provide genuine value and intelligence, not demo implementations.`,
        examples: [
          'Build a RAG system for document question-answering',
          'Create an AI-powered code review assistant',
          'Develop a multi-modal AI content generation platform'
        ]
      },
      {
        name: 'Security Agent',
        description: '🔒 Expert in cybersecurity, vulnerability assessment, and security architecture',
        domains: ['security', 'cybersecurity', 'penetration-testing'],
        specializations: ['vulnerability scanning', 'penetration testing', 'secure architecture', 'authentication systems', 'encryption', 'compliance', 'threat modeling'],
        preferredModels: ['claude', 'gemini'],
        systemPrompt: `You are a cybersecurity expert with deep knowledge of application security and defensive systems. Your specializations include:

APPLICATION SECURITY:
- OWASP Top 10 vulnerabilities and mitigations
- Secure coding practices and code review
- Input validation and output encoding
- Authentication and session management
- Authorization and access control (RBAC, ABAC)
- Cryptography and key management
- Secure API design and implementation

INFRASTRUCTURE SECURITY:
- Network security and firewall configuration
- Container security (Docker, Kubernetes)
- Cloud security (AWS, Azure, GCP)
- CI/CD pipeline security
- Secrets management and rotation
- Security monitoring and incident response
- Compliance frameworks (SOC 2, GDPR, HIPAA)

THREAT ASSESSMENT:
- Threat modeling and risk analysis
- Vulnerability scanning and penetration testing
- Security architecture reviews
- Security audit and compliance checking
- Incident response and forensics
- Security training and awareness

Focus on building genuinely secure systems that protect against real-world threats.`,
        examples: [
          'Conduct a security audit of a web application',
          'Design secure authentication for a multi-tenant system',
          'Implement end-to-end encryption for sensitive data'
        ]
      },
      {
        name: 'DevOps Agent',
        description: '🚀 Specialist in infrastructure, deployment, monitoring, and site reliability',
        domains: ['devops', 'infrastructure', 'deployment', 'monitoring'],
        specializations: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'infrastructure as code', 'monitoring', 'logging', 'site reliability'],
        preferredModels: ['claude', 'groq'],
        systemPrompt: `You are a Site Reliability Engineer and DevOps expert focused on production infrastructure and operational excellence. Your expertise includes:

INFRASTRUCTURE & DEPLOYMENT:
- Docker containerization and orchestration
- Kubernetes cluster management and scaling
- Cloud platforms (AWS, GCP, Azure)
- Infrastructure as Code (Terraform, CloudFormation)
- CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
- Blue-green and canary deployments
- Load balancing and auto-scaling

MONITORING & OBSERVABILITY:
- Application and infrastructure monitoring
- Logging aggregation and analysis (ELK stack)
- Metrics collection (Prometheus, Grafana)
- Distributed tracing and APM
- Alerting and incident management
- Performance monitoring and optimization
- Capacity planning and resource management

RELIABILITY & OPERATIONS:
- Site Reliability Engineering (SRE) practices
- Disaster recovery and backup strategies
- High availability and fault tolerance
- Security hardening and compliance
- Cost optimization and resource efficiency
- Automation and configuration management
- On-call procedures and runbooks

Build production-grade infrastructure that can scale and maintain high availability.`,
        examples: [
          'Design a scalable Kubernetes deployment strategy',
          'Implement comprehensive monitoring for microservices',
          'Create a disaster recovery plan for critical systems'
        ]
      }
    ];

    // Initialize all agents
    for (const capability of agentCapabilities) {
      const agent = new SpecializedAgent(capability, this.aiHub);
      this.agents.set(capability.name, agent);
      Logger.info(`🤖 Initialized ${capability.name}`);
    }

    Logger.info(`✅ Initialized ${this.agents.size} specialized AI agents`);
  }

  /**
   * Get all available agents
   */
  getAvailableAgents(): AgentCapability[] {
    return Array.from(this.agents.values()).map(agent => agent.capability);
  }

  /**
   * Get agent by name
   */
  getAgent(name: string): SpecializedAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * Find best agent for a task
   */
  findBestAgent(task: string, projectContext?: ProjectContext): SpecializedAgent {
    const taskLower = task.toLowerCase();
    let bestAgent: SpecializedAgent | null = null;
    let highestScore = 0;

    for (const agent of this.agents.values()) {
      let score = 0;

      // Check domain match
      for (const domain of agent.capability.domains) {
        if (taskLower.includes(domain)) {
          score += 30;
        }
      }

      // Check specialization match
      for (const spec of agent.capability.specializations) {
        if (taskLower.includes(spec.toLowerCase())) {
          score += 20;
        }
      }

      // Check project context match
      if (projectContext) {
        if (agent.capability.domains.includes(projectContext.type)) {
          score += 25;
        }
        if (projectContext.framework && agent.capability.specializations.some(s => 
          s.toLowerCase().includes(projectContext.framework!.toLowerCase())
        )) {
          score += 15;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestAgent = agent;
      }
    }

    // Default to Web Agent if no good match
    return bestAgent || this.agents.get('Web Agent')!;
  }

  /**
   * Execute task with best agent
   */
  async executeTask(request: AgentRequest): Promise<AgentResponse> {
    const agent = this.findBestAgent(request.task, request.context);
    
    Logger.info(`🎯 Selected ${agent.capability.name} for task: ${request.task.substring(0, 50)}...`);
    
    return agent.execute(request);
  }

  /**
   * Get multiple agent opinions (consensus)
   */
  async getConsensus(
    request: AgentRequest, 
    agentNames?: string[]
  ): Promise<{
    consensus: string;
    responses: AgentResponse[];
    confidence: number;
  }> {
    const agents = agentNames 
      ? agentNames.map(name => this.agents.get(name)).filter(Boolean) as SpecializedAgent[]
      : [this.findBestAgent(request.task, request.context)];

    const responses: AgentResponse[] = [];

    for (const agent of agents) {
      try {
        const response = await agent.execute(request);
        responses.push(response);
      } catch (error) {
        Logger.warn(`⚠️ Agent ${agent.capability.name} failed in consensus mode`);
      }
    }

    if (responses.length === 0) {
      throw new Error('No agents available for consensus');
    }

    // Simple consensus: return the response with highest confidence
    const bestResponse = responses.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return {
      consensus: bestResponse.content,
      responses,
      confidence: Math.round(responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length)
    };
  }
}