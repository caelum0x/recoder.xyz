interface Agent {
  id: string;
  name: string;
  description: string;
  version: string;
  authorId: string;
  authorName: string;
  category: 'development' | 'design' | 'testing' | 'analysis' | 'documentation' | 'utility' | 'custom';
  tags: string[];
  capabilities: string[];
  pricing: {
    type: 'free' | 'paid' | 'freemium' | 'subscription';
    price?: number;
    currency?: string;
    billingPeriod?: 'monthly' | 'yearly' | 'one-time';
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    downloads: number;
    rating: number;
    ratingCount: number;
    isVerified: boolean;
    isPublic: boolean;
    license: string;
  };
  configuration: {
    prompts: AgentPrompt[];
    tools: string[];
    models: string[];
    parameters: AgentParameter[];
    workflows: AgentWorkflow[];
  };
  requirements: {
    minCraftCodeVersion: string;
    dependencies: string[];
    permissions: string[];
    resources: {
      memory?: number;
      cpu?: number;
      storage?: number;
    };
  };
}

interface AgentPrompt {
  id: string;
  name: string;
  template: string;
  variables: string[];
  examples: Array<{
    input: Record<string, any>;
    output: string;
  }>;
}

interface AgentParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

interface AgentWorkflow {
  id: string;
  name: string;
  steps: Array<{
    id: string;
    type: 'prompt' | 'tool' | 'condition' | 'loop';
    config: any;
    nextSteps: string[];
  }>;
  triggers: string[];
}

interface AgentReview {
  id: string;
  agentId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  content: string;
  pros: string[];
  cons: string[];
  createdAt: Date;
  helpful: number;
  verified: boolean;
}

interface AgentInstallation {
  id: string;
  agentId: string;
  userId: string;
  version: string;
  installedAt: Date;
  lastUsed: Date;
  usageCount: number;
  customizations: Record<string, any>;
  status: 'active' | 'disabled' | 'error';
}

interface MarketplaceStats {
  totalAgents: number;
  totalDownloads: number;
  totalUsers: number;
  topCategories: Array<{category: string, count: number}>;
  recentlyAdded: Agent[];
  trending: Agent[];
  topRated: Agent[];
}

export class AgentMarketplace {
  private agents: Map<string, Agent> = new Map();
  private reviews: Map<string, AgentReview[]> = new Map();
  private installations: Map<string, AgentInstallation[]> = new Map();
  private userCollections: Map<string, Set<string>> = new Map();
  private analytics: Map<string, any> = new Map();

  constructor() {
    this.loadMarketplaceData();
    this.initializeDefaultAgents();
  }

  publishAgent(agent: Omit<Agent, 'id' | 'metadata'>): Agent {
    const publishedAgent: Agent = {
      ...agent,
      id: this.generateAgentId(),
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        downloads: 0,
        rating: 0,
        ratingCount: 0,
        isVerified: false,
        isPublic: true,
        license: agent.requirements?.dependencies?.includes('commercial') ? 'commercial' : 'MIT'
      }
    };

    // Validate agent before publishing
    const validation = this.validateAgent(publishedAgent);
    if (!validation.valid) {
      throw new Error(`Agent validation failed: ${validation.errors.join(', ')}`);
    }

    this.agents.set(publishedAgent.id, publishedAgent);
    this.reviews.set(publishedAgent.id, []);
    
    // Initialize analytics
    this.analytics.set(publishedAgent.id, {
      views: 0,
      downloads: 0,
      installations: 0,
      ratings: [],
      usage: new Map()
    });

    return publishedAgent;
  }

  updateAgent(agentId: string, updates: Partial<Agent>, authorId: string): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.authorId !== authorId) {
      throw new Error('Only the agent author can update the agent');
    }

    const updatedAgent: Agent = {
      ...agent,
      ...updates,
      id: agentId, // Preserve ID
      authorId: agent.authorId, // Preserve author
      metadata: {
        ...agent.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
    };

    // Validate updated agent
    const validation = this.validateAgent(updatedAgent);
    if (!validation.valid) {
      throw new Error(`Agent validation failed: ${validation.errors.join(', ')}`);
    }

    this.agents.set(agentId, updatedAgent);
    return updatedAgent;
  }

  searchAgents(query: {
    text?: string;
    category?: string;
    tags?: string[];
    author?: string;
    minRating?: number;
    pricing?: string[];
    sortBy?: 'relevance' | 'rating' | 'downloads' | 'recent' | 'name';
    limit?: number;
    offset?: number;
  }): {
    agents: Agent[];
    total: number;
    facets: {
      categories: Record<string, number>;
      tags: Record<string, number>;
      pricing: Record<string, number>;
    };
  } {
    let filteredAgents = Array.from(this.agents.values()).filter(agent => agent.metadata.isPublic);

    // Text search
    if (query.text) {
      const searchTerms = query.text.toLowerCase().split(' ');
      filteredAgents = filteredAgents.filter(agent => {
        const searchableText = `${agent.name} ${agent.description} ${agent.tags.join(' ')} ${agent.capabilities.join(' ')}`.toLowerCase();
        return searchTerms.every(term => searchableText.includes(term));
      });
    }

    // Category filter
    if (query.category) {
      filteredAgents = filteredAgents.filter(agent => agent.category === query.category);
    }

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      filteredAgents = filteredAgents.filter(agent => 
        query.tags!.some(tag => agent.tags.includes(tag))
      );
    }

    // Author filter
    if (query.author) {
      filteredAgents = filteredAgents.filter(agent => 
        agent.authorName.toLowerCase().includes(query.author!.toLowerCase())
      );
    }

    // Rating filter
    if (query.minRating) {
      filteredAgents = filteredAgents.filter(agent => agent.metadata.rating >= query.minRating!);
    }

    // Pricing filter
    if (query.pricing && query.pricing.length > 0) {
      filteredAgents = filteredAgents.filter(agent => 
        query.pricing!.includes(agent.pricing.type)
      );
    }

    // Generate facets
    const facets = this.generateFacets(filteredAgents);

    // Sort results
    this.sortAgents(filteredAgents, query.sortBy || 'relevance', query.text);

    // Pagination
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    const paginatedAgents = filteredAgents.slice(offset, offset + limit);

    return {
      agents: paginatedAgents,
      total: filteredAgents.length,
      facets
    };
  }

  getAgent(agentId: string): Agent | null {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Track view
      this.trackAnalytics(agentId, 'view');
    }
    return agent || null;
  }

  installAgent(agentId: string, userId: string, options?: {
    customizations?: Record<string, any>;
    autoUpdate?: boolean;
  }): AgentInstallation {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check if already installed
    const userInstallations = this.installations.get(userId) || [];
    const existingInstallation = userInstallations.find(inst => inst.agentId === agentId);
    
    if (existingInstallation) {
      throw new Error('Agent is already installed');
    }

    const installation: AgentInstallation = {
      id: this.generateInstallationId(),
      agentId,
      userId,
      version: agent.version,
      installedAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0,
      customizations: options?.customizations || {},
      status: 'active'
    };

    userInstallations.push(installation);
    this.installations.set(userId, userInstallations);

    // Update agent download count
    agent.metadata.downloads++;
    
    // Track analytics
    this.trackAnalytics(agentId, 'download');
    this.trackAnalytics(agentId, 'installation');

    return installation;
  }

  uninstallAgent(agentId: string, userId: string): boolean {
    const userInstallations = this.installations.get(userId) || [];
    const installationIndex = userInstallations.findIndex(inst => inst.agentId === agentId);
    
    if (installationIndex === -1) {
      return false;
    }

    userInstallations.splice(installationIndex, 1);
    this.installations.set(userId, userInstallations);
    
    return true;
  }

  getUserInstallations(userId: string): AgentInstallation[] {
    return this.installations.get(userId) || [];
  }

  addReview(review: Omit<AgentReview, 'id' | 'createdAt' | 'helpful'>): AgentReview {
    const agent = this.agents.get(review.agentId);
    if (!agent) {
      throw new Error(`Agent ${review.agentId} not found`);
    }

    // Check if user already reviewed this agent
    const agentReviews = this.reviews.get(review.agentId) || [];
    const existingReview = agentReviews.find(r => r.userId === review.userId);
    
    if (existingReview) {
      throw new Error('User has already reviewed this agent');
    }

    const newReview: AgentReview = {
      ...review,
      id: this.generateReviewId(),
      createdAt: new Date(),
      helpful: 0
    };

    agentReviews.push(newReview);
    this.reviews.set(review.agentId, agentReviews);

    // Update agent rating
    this.updateAgentRating(review.agentId);

    return newReview;
  }

  getAgentReviews(agentId: string, options?: {
    sortBy?: 'recent' | 'rating' | 'helpful';
    limit?: number;
    offset?: number;
  }): {
    reviews: AgentReview[];
    total: number;
    averageRating: number;
  } {
    const reviews = this.reviews.get(agentId) || [];
    
    // Sort reviews
    const sortedReviews = [...reviews];
    switch (options?.sortBy || 'recent') {
      case 'recent':
        sortedReviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'rating':
        sortedReviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'helpful':
        sortedReviews.sort((a, b) => b.helpful - a.helpful);
        break;
    }

    // Pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 10;
    const paginatedReviews = sortedReviews.slice(offset, offset + limit);

    const averageRating = reviews.length > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : 0;

    return {
      reviews: paginatedReviews,
      total: reviews.length,
      averageRating
    };
  }

  createCollection(userId: string, name: string, description?: string): {
    id: string;
    name: string;
    description?: string;
    agents: string[];
    createdAt: Date;
  } {
    const collectionId = this.generateCollectionId();
    const collection = {
      id: collectionId,
      name,
      description,
      agents: [],
      createdAt: new Date()
    };

    // Store collection (simplified - in production would use proper storage)
    return collection;
  }

  addToCollection(userId: string, collectionId: string, agentId: string): boolean {
    const userCollections = this.userCollections.get(userId) || new Set();
    userCollections.add(agentId);
    this.userCollections.set(userId, userCollections);
    return true;
  }

  getMarketplaceStats(): MarketplaceStats {
    const agents = Array.from(this.agents.values()).filter(a => a.metadata.isPublic);
    
    const categoryCount = new Map<string, number>();
    let totalDownloads = 0;
    
    agents.forEach(agent => {
      categoryCount.set(agent.category, (categoryCount.get(agent.category) || 0) + 1);
      totalDownloads += agent.metadata.downloads;
    });

    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const recentlyAdded = agents
      .sort((a, b) => b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime())
      .slice(0, 10);

    const trending = agents
      .sort((a, b) => b.metadata.downloads - a.metadata.downloads)
      .slice(0, 10);

    const topRated = agents
      .filter(a => a.metadata.ratingCount > 5)
      .sort((a, b) => b.metadata.rating - a.metadata.rating)
      .slice(0, 10);

    return {
      totalAgents: agents.length,
      totalDownloads,
      totalUsers: this.installations.size,
      topCategories,
      recentlyAdded,
      trending,
      topRated
    };
  }

  getFeaturedAgents(): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.metadata.isVerified && agent.metadata.isPublic)
      .sort((a, b) => b.metadata.rating - a.metadata.rating)
      .slice(0, 6);
  }

  getRecommendations(userId: string): Agent[] {
    const userInstallations = this.installations.get(userId) || [];
    const installedCategories = new Set<string>();
    const installedTags = new Set<string>();

    // Analyze user preferences
    userInstallations.forEach(installation => {
      const agent = this.agents.get(installation.agentId);
      if (agent) {
        installedCategories.add(agent.category);
        agent.tags.forEach(tag => installedTags.add(tag));
      }
    });

    // Find similar agents
    return Array.from(this.agents.values())
      .filter(agent => {
        // Exclude already installed agents
        if (userInstallations.some(inst => inst.agentId === agent.id)) {
          return false;
        }
        
        // Must be public
        if (!agent.metadata.isPublic) {
          return false;
        }

        // Score based on similarity
        let score = 0;
        if (installedCategories.has(agent.category)) score += 3;
        agent.tags.forEach(tag => {
          if (installedTags.has(tag)) score += 1;
        });

        return score > 0;
      })
      .sort((a, b) => b.metadata.rating - a.metadata.rating)
      .slice(0, 8);
  }

  validateAgent(agent: Agent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!agent.name || agent.name.trim().length === 0) {
      errors.push('Agent name is required');
    }

    if (!agent.description || agent.description.trim().length === 0) {
      errors.push('Agent description is required');
    }

    if (!agent.version) {
      errors.push('Agent version is required');
    }

    if (!agent.configuration.prompts || agent.configuration.prompts.length === 0) {
      errors.push('At least one prompt is required');
    }

    // Validate prompts
    agent.configuration.prompts.forEach((prompt, index) => {
      if (!prompt.template || prompt.template.trim().length === 0) {
        errors.push(`Prompt ${index + 1} template is required`);
      }
    });

    // Validate parameters
    agent.configuration.parameters.forEach((param, index) => {
      if (!param.name || param.name.trim().length === 0) {
        errors.push(`Parameter ${index + 1} name is required`);
      }
      if (!param.type) {
        errors.push(`Parameter ${index + 1} type is required`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private updateAgentRating(agentId: string): void {
    const reviews = this.reviews.get(agentId) || [];
    const agent = this.agents.get(agentId);
    
    if (!agent || reviews.length === 0) return;

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;

    agent.metadata.rating = Math.round(averageRating * 100) / 100; // Round to 2 decimal places
    agent.metadata.ratingCount = reviews.length;
  }

  private generateFacets(agents: Agent[]): {
    categories: Record<string, number>;
    tags: Record<string, number>;
    pricing: Record<string, number>;
  } {
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const pricing: Record<string, number> = {};

    agents.forEach(agent => {
      // Categories
      categories[agent.category] = (categories[agent.category] || 0) + 1;

      // Tags
      agent.tags.forEach(tag => {
        tags[tag] = (tags[tag] || 0) + 1;
      });

      // Pricing
      pricing[agent.pricing.type] = (pricing[agent.pricing.type] || 0) + 1;
    });

    return { categories, tags, pricing };
  }

  private sortAgents(agents: Agent[], sortBy: string, searchText?: string): void {
    switch (sortBy) {
      case 'relevance':
        if (searchText) {
          // Simple relevance scoring
          agents.sort((a, b) => {
            const aScore = this.calculateRelevanceScore(a, searchText);
            const bScore = this.calculateRelevanceScore(b, searchText);
            return bScore - aScore;
          });
        } else {
          // Default to rating when no search text
          agents.sort((a, b) => b.metadata.rating - a.metadata.rating);
        }
        break;
      case 'rating':
        agents.sort((a, b) => b.metadata.rating - a.metadata.rating);
        break;
      case 'downloads':
        agents.sort((a, b) => b.metadata.downloads - a.metadata.downloads);
        break;
      case 'recent':
        agents.sort((a, b) => b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime());
        break;
      case 'name':
        agents.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
  }

  private calculateRelevanceScore(agent: Agent, searchText: string): number {
    const text = searchText.toLowerCase();
    let score = 0;

    // Name match (highest weight)
    if (agent.name.toLowerCase().includes(text)) score += 10;
    
    // Description match
    if (agent.description.toLowerCase().includes(text)) score += 5;
    
    // Tags match
    agent.tags.forEach(tag => {
      if (tag.toLowerCase().includes(text)) score += 3;
    });

    // Capabilities match
    agent.capabilities.forEach(capability => {
      if (capability.toLowerCase().includes(text)) score += 2;
    });

    // Boost for verified agents
    if (agent.metadata.isVerified) score += 1;

    return score;
  }

  private trackAnalytics(agentId: string, event: string): void {
    const analytics = this.analytics.get(agentId);
    if (analytics) {
      switch (event) {
        case 'view':
          analytics.views++;
          break;
        case 'download':
          analytics.downloads++;
          break;
        case 'installation':
          analytics.installations++;
          break;
      }
    }
  }

  private initializeDefaultAgents(): void {
    // Add some default/featured agents
    const defaultAgents = [
      {
        name: 'Code Reviewer',
        description: 'AI agent that performs comprehensive code reviews with suggestions for improvements',
        version: '1.0.0',
        authorId: 'system',
        authorName: 'Craft Code Team',
        category: 'development' as const,
        tags: ['code-review', 'quality', 'best-practices'],
        capabilities: ['code analysis', 'security scanning', 'performance optimization'],
        pricing: { type: 'free' as const },
        configuration: {
          prompts: [{
            id: 'review',
            name: 'Code Review',
            template: 'Review this code for quality, security, and performance issues: {code}',
            variables: ['code'],
            examples: []
          }],
          tools: ['static-analysis', 'security-scanner'],
          models: ['gpt-4', 'claude-3'],
          parameters: [],
          workflows: []
        },
        requirements: {
          minCraftCodeVersion: '1.0.0',
          dependencies: [],
          permissions: ['read-files'],
          resources: {}
        }
      }
    ];

    defaultAgents.forEach(agent => {
      try {
        this.publishAgent(agent);
      } catch (error) {
        console.warn('Failed to publish default agent:', error);
      }
    });
  }

  private loadMarketplaceData(): void {
    // Load from persistent storage
  }

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInstallationId(): string {
    return `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReviewId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCollectionId(): string {
    return `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}