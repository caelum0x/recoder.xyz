interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  ownerId: string;
  visibility: 'private' | 'team' | 'organization' | 'public';
  categories: Map<string, Category>;
  articles: Map<string, Article>;
  tags: Set<string>;
  collaborators: Map<string, Collaborator>;
  settings: KnowledgeBaseSettings;
  metrics: {
    totalArticles: number;
    totalViews: number;
    contributorCount: number;
    lastUpdated: Date;
    searchQueries: number;
    helpfulnessScore: number;
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: string;
    language: string;
    indexedAt?: Date;
  };
}

interface Article {
  id: string;
  title: string;
  content: string;
  summary: string;
  authorId: string;
  categoryId: string;
  tags: string[];
  type: 'guide' | 'tutorial' | 'reference' | 'troubleshooting' | 'best-practice' | 'faq' | 'snippet';
  status: 'draft' | 'review' | 'published' | 'archived';
  visibility: 'private' | 'team' | 'public';
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    publishedAt?: Date;
    version: number;
    wordCount: number;
    readTime: number; // estimated minutes
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    language: string;
  };
  content_blocks: ContentBlock[];
  references: Reference[];
  attachments: Attachment[];
  comments: Comment[];
  reactions: Map<string, Reaction[]>; // emoji -> users
  analytics: {
    views: number;
    uniqueViews: number;
    shares: number;
    bookmarks: number;
    helpfulVotes: number;
    unhelpfulVotes: number;
    avgTimeSpent: number;
    bounceRate: number;
  };
  ai_insights: {
    topics: string[];
    concepts: string[];
    relatedArticles: string[];
    suggestedUpdates: string[];
    qualityScore: number;
    completenessScore: number;
  };
}

interface ContentBlock {
  id: string;
  type: 'text' | 'code' | 'image' | 'video' | 'embed' | 'table' | 'list' | 'quote' | 'callout';
  content: string;
  metadata: {
    language?: string; // for code blocks
    caption?: string; // for images/videos
    source?: string; // for quotes/embeds
  };
  order: number;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  icon?: string;
  color?: string;
  articleCount: number;
  subcategories: string[];
  moderators: string[];
  settings: {
    requireApproval: boolean;
    allowContributions: boolean;
    autoTag: string[];
  };
}

interface Reference {
  id: string;
  type: 'internal' | 'external' | 'code' | 'documentation';
  title: string;
  url?: string;
  articleId?: string; // for internal references
  description?: string;
  metadata: {
    addedAt: Date;
    addedBy: string;
    verified: boolean;
    lastChecked?: Date;
  };
}

interface Attachment {
  id: string;
  filename: string;
  type: string; // MIME type
  size: number;
  url: string;
  description?: string;
  uploadedBy: string;
  uploadedAt: Date;
}

interface Comment {
  id: string;
  content: string;
  authorId: string;
  parentId?: string; // for nested comments
  createdAt: Date;
  updatedAt?: Date;
  resolved: boolean;
  reactions: Map<string, string[]>; // emoji -> user IDs
}

interface Reaction {
  userId: string;
  emoji: string;
  createdAt: Date;
}

interface Collaborator {
  userId: string;
  role: 'admin' | 'editor' | 'contributor' | 'viewer';
  permissions: {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canModerate: boolean;
    canInvite: boolean;
    canExport: boolean;
  };
  joinedAt: Date;
  lastActive: Date;
  contributionStats: {
    articlesCreated: number;
    articlesEdited: number;
    commentsAdded: number;
    helpfulVotes: number;
  };
}

interface KnowledgeBaseSettings {
  general: {
    allowAnonymousViewing: boolean;
    requireApprovalForNew: boolean;
    enableComments: boolean;
    enableReactions: boolean;
    enableVersioning: boolean;
    defaultLanguage: string;
  };
  ai: {
    enableAutoSuggestions: boolean;
    enableContentAnalysis: boolean;
    enableSmartSearch: boolean;
    autoGenerateSummaries: boolean;
    suggestRelatedContent: boolean;
    qualityThreshold: number;
  };
  moderation: {
    autoModeration: boolean;
    flaggedContentThreshold: number;
    spamDetection: boolean;
    profanityFilter: boolean;
  };
  notifications: {
    newArticleNotifications: boolean;
    commentNotifications: boolean;
    weeklyDigest: boolean;
    channels: ('email' | 'slack' | 'discord' | 'in-app')[];
  };
  search: {
    enableFullTextSearch: boolean;
    indexUpdateFrequency: 'realtime' | 'hourly' | 'daily';
    searchResultsPerPage: number;
    enableAutoComplete: boolean;
  };
}

interface SearchQuery {
  query: string;
  filters?: {
    categories?: string[];
    tags?: string[];
    authors?: string[];
    types?: string[];
    dateRange?: {
      start: Date;
      end: Date;
    };
    difficulty?: string[];
  };
  sorting?: {
    field: 'relevance' | 'date' | 'views' | 'helpfulness';
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

interface SearchResult {
  articles: Array<{
    article: Article;
    score: number;
    highlights: {
      title?: string;
      content?: string[];
      summary?: string;
    };
  }>;
  total: number;
  facets: {
    categories: Record<string, number>;
    tags: Record<string, number>;
    authors: Record<string, number>;
    types: Record<string, number>;
  };
  suggestions: string[];
  relatedQueries: string[];
}

export class KnowledgeSharingSystem {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private searchIndex: SearchIndex;
  private aiAnalyzer: AIContentAnalyzer;
  private contentModerator: ContentModerator;
  private notificationService: NotificationService;

  constructor() {
    this.searchIndex = new SearchIndex();
    this.aiAnalyzer = new AIContentAnalyzer();
    this.contentModerator = new ContentModerator();
    this.notificationService = new NotificationService();
    this.loadKnowledgeBases();
  }

  createKnowledgeBase(config: {
    name: string;
    description?: string;
    ownerId: string;
    organizationId?: string;
    visibility?: KnowledgeBase['visibility'];
    settings?: Partial<KnowledgeBaseSettings>;
  }): KnowledgeBase {
    const knowledgeBase: KnowledgeBase = {
      id: this.generateKnowledgeBaseId(),
      name: config.name,
      description: config.description,
      organizationId: config.organizationId,
      ownerId: config.ownerId,
      visibility: config.visibility || 'team',
      categories: new Map(),
      articles: new Map(),
      tags: new Set(),
      collaborators: new Map(),
      settings: this.mergeWithDefaultSettings(config.settings),
      metrics: {
        totalArticles: 0,
        totalViews: 0,
        contributorCount: 1,
        lastUpdated: new Date(),
        searchQueries: 0,
        helpfulnessScore: 0
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        language: 'en'
      }
    };

    // Add owner as admin collaborator
    knowledgeBase.collaborators.set(config.ownerId, {
      userId: config.ownerId,
      role: 'admin',
      permissions: this.getAdminPermissions(),
      joinedAt: new Date(),
      lastActive: new Date(),
      contributionStats: {
        articlesCreated: 0,
        articlesEdited: 0,
        commentsAdded: 0,
        helpfulVotes: 0
      }
    });

    this.knowledgeBases.set(knowledgeBase.id, knowledgeBase);
    
    // Create default categories
    this.createDefaultCategories(knowledgeBase.id);

    return knowledgeBase;
  }

  async createArticle(knowledgeBaseId: string, article: {
    title: string;
    content: string;
    authorId: string;
    categoryId?: string;
    tags?: string[];
    type?: Article['type'];
    visibility?: Article['visibility'];
    difficulty?: Article['metadata']['difficulty'];
  }): Promise<Article> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    // Check permissions
    const collaborator = knowledgeBase.collaborators.get(article.authorId);
    if (!collaborator || !collaborator.permissions.canCreate) {
      throw new Error('Insufficient permissions to create articles');
    }

    // Process content
    const contentBlocks = await this.parseContentBlocks(article.content);
    const summary = await this.aiAnalyzer.generateSummary(article.content);
    const aiInsights = await this.aiAnalyzer.analyzeContent(article.content);

    const newArticle: Article = {
      id: this.generateArticleId(),
      title: article.title,
      content: article.content,
      summary,
      authorId: article.authorId,
      categoryId: article.categoryId || 'general',
      tags: article.tags || [],
      type: article.type || 'guide',
      status: knowledgeBase.settings.general.requireApprovalForNew ? 'review' : 'published',
      visibility: article.visibility || 'team',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: knowledgeBase.settings.general.requireApprovalForNew ? undefined : new Date(),
        version: 1,
        wordCount: this.countWords(article.content),
        readTime: this.calculateReadTime(article.content),
        difficulty: article.difficulty || 'intermediate',
        language: knowledgeBase.metadata.language
      },
      content_blocks: contentBlocks,
      references: [],
      attachments: [],
      comments: [],
      reactions: new Map(),
      analytics: {
        views: 0,
        uniqueViews: 0,
        shares: 0,
        bookmarks: 0,
        helpfulVotes: 0,
        unhelpfulVotes: 0,
        avgTimeSpent: 0,
        bounceRate: 0
      },
      ai_insights: aiInsights
    };

    // Content moderation
    const moderationResult = await this.contentModerator.checkContent(newArticle);
    if (!moderationResult.approved) {
      newArticle.status = 'review';
    }

    knowledgeBase.articles.set(newArticle.id, newArticle);
    
    // Update tags
    article.tags?.forEach(tag => knowledgeBase.tags.add(tag));
    
    // Update metrics
    knowledgeBase.metrics.totalArticles++;
    knowledgeBase.metrics.lastUpdated = new Date();
    knowledgeBase.metadata.updatedAt = new Date();

    // Update category count
    if (article.categoryId) {
      const category = knowledgeBase.categories.get(article.categoryId);
      if (category) {
        category.articleCount++;
      }
    }

    // Index for search
    await this.searchIndex.indexArticle(newArticle, knowledgeBase);

    // Send notifications
    if (newArticle.status === 'published') {
      await this.notificationService.notifyNewArticle(knowledgeBase, newArticle);
    }

    return newArticle;
  }

  async updateArticle(knowledgeBaseId: string, articleId: string, updates: Partial<Article>, updatedBy: string): Promise<Article> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    const article = knowledgeBase.articles.get(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    // Check permissions
    const collaborator = knowledgeBase.collaborators.get(updatedBy);
    const canEdit = collaborator?.permissions.canEdit || article.authorId === updatedBy;
    if (!canEdit) {
      throw new Error('Insufficient permissions to edit this article');
    }

    // Create new version if versioning is enabled
    if (knowledgeBase.settings.general.enableVersioning) {
      article.metadata.version++;
    }

    // Update article
    const updatedArticle = {
      ...article,
      ...updates,
      id: articleId, // Preserve ID
      metadata: {
        ...article.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
    };

    // Re-analyze content if changed
    if (updates.content && updates.content !== article.content) {
      updatedArticle.summary = await this.aiAnalyzer.generateSummary(updates.content);
      updatedArticle.ai_insights = await this.aiAnalyzer.analyzeContent(updates.content);
      updatedArticle.metadata.wordCount = this.countWords(updates.content);
      updatedArticle.metadata.readTime = this.calculateReadTime(updates.content);
      updatedArticle.content_blocks = await this.parseContentBlocks(updates.content);
    }

    knowledgeBase.articles.set(articleId, updatedArticle);
    knowledgeBase.metadata.updatedAt = new Date();

    // Re-index for search
    await this.searchIndex.indexArticle(updatedArticle, knowledgeBase);

    return updatedArticle;
  }

  async searchArticles(knowledgeBaseId: string, query: SearchQuery, userId?: string): Promise<SearchResult> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    // Check access permissions
    if (!this.canUserAccessKnowledgeBase(knowledgeBase, userId)) {
      throw new Error('Access denied to knowledge base');
    }

    // Perform search
    const searchResult = await this.searchIndex.search(knowledgeBase, query);

    // Filter results based on user permissions
    const filteredResults = searchResult.articles.filter(result => 
      this.canUserAccessArticle(result.article, userId)
    );

    // Track search analytics
    knowledgeBase.metrics.searchQueries++;

    return {
      ...searchResult,
      articles: filteredResults,
      total: filteredResults.length
    };
  }

  async getArticleRecommendations(knowledgeBaseId: string, articleId: string, userId?: string): Promise<Article[]> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    const article = knowledgeBase.articles.get(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    // Get AI-powered recommendations
    const recommendations = await this.aiAnalyzer.getRecommendations(article, knowledgeBase);
    
    // Filter by user permissions
    return recommendations.filter(rec => this.canUserAccessArticle(rec, userId));
  }

  async addComment(knowledgeBaseId: string, articleId: string, comment: {
    content: string;
    authorId: string;
    parentId?: string;
  }): Promise<Comment> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    if (!knowledgeBase.settings.general.enableComments) {
      throw new Error('Comments are disabled for this knowledge base');
    }

    const article = knowledgeBase.articles.get(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    const newComment: Comment = {
      id: this.generateCommentId(),
      content: comment.content,
      authorId: comment.authorId,
      parentId: comment.parentId,
      createdAt: new Date(),
      resolved: false,
      reactions: new Map()
    };

    // Content moderation
    const moderationResult = await this.contentModerator.checkComment(newComment);
    if (!moderationResult.approved) {
      throw new Error('Comment violates community guidelines');
    }

    article.comments.push(newComment);
    knowledgeBase.metadata.updatedAt = new Date();

    return newComment;
  }

  async addReaction(knowledgeBaseId: string, articleId: string, reaction: {
    userId: string;
    emoji: string;
  }): Promise<void> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    if (!knowledgeBase.settings.general.enableReactions) {
      throw new Error('Reactions are disabled for this knowledge base');
    }

    const article = knowledgeBase.articles.get(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    const emojiReactions = article.reactions.get(reaction.emoji) || [];
    
    // Check if user already reacted with this emoji
    const existingReaction = emojiReactions.find(r => r.userId === reaction.userId);
    if (existingReaction) {
      // Remove existing reaction
      const index = emojiReactions.indexOf(existingReaction);
      emojiReactions.splice(index, 1);
    } else {
      // Add new reaction
      emojiReactions.push({
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: new Date()
      });
    }

    article.reactions.set(reaction.emoji, emojiReactions);
  }

  async voteHelpfulness(knowledgeBaseId: string, articleId: string, vote: {
    userId: string;
    helpful: boolean;
  }): Promise<void> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    const article = knowledgeBase.articles.get(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    // Update vote counts
    if (vote.helpful) {
      article.analytics.helpfulVotes++;
    } else {
      article.analytics.unhelpfulVotes++;
    }

    // Update knowledge base helpfulness score
    this.updateHelpfulnessScore(knowledgeBase);
  }

  async getKnowledgeBaseAnalytics(knowledgeBaseId: string, period: 'week' | 'month' | 'quarter'): Promise<{
    overview: {
      totalArticles: number;
      totalViews: number;
      totalContributors: number;
      helpfulnessScore: number;
    };
    topArticles: Array<{
      article: Article;
      views: number;
      helpfulnessRatio: number;
    }>;
    topContributors: Array<{
      userId: string;
      articlesCreated: number;
      totalViews: number;
      helpfulnessScore: number;
    }>;
    searchAnalytics: {
      topQueries: Array<{
        query: string;
        count: number;
        results: number;
      }>;
      noResultsQueries: string[];
    };
    trends: {
      articleCreation: number[];
      viewsTrend: number[];
      searchTrend: number[];
    };
  }> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    // Calculate analytics (mock implementation)
    const articles = Array.from(knowledgeBase.articles.values());
    
    const topArticles = articles
      .sort((a, b) => b.analytics.views - a.analytics.views)
      .slice(0, 10)
      .map(article => ({
        article,
        views: article.analytics.views,
        helpfulnessRatio: article.analytics.helpfulVotes / Math.max(1, article.analytics.helpfulVotes + article.analytics.unhelpfulVotes)
      }));

    const contributorStats = new Map<string, any>();
    articles.forEach(article => {
      const stats = contributorStats.get(article.authorId) || {
        userId: article.authorId,
        articlesCreated: 0,
        totalViews: 0,
        helpfulnessScore: 0
      };
      stats.articlesCreated++;
      stats.totalViews += article.analytics.views;
      stats.helpfulnessScore += article.analytics.helpfulVotes;
      contributorStats.set(article.authorId, stats);
    });

    const topContributors = Array.from(contributorStats.values())
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 10);

    return {
      overview: {
        totalArticles: knowledgeBase.metrics.totalArticles,
        totalViews: knowledgeBase.metrics.totalViews,
        totalContributors: knowledgeBase.metrics.contributorCount,
        helpfulnessScore: knowledgeBase.metrics.helpfulnessScore
      },
      topArticles,
      topContributors,
      searchAnalytics: {
        topQueries: [], // Would be populated from search logs
        noResultsQueries: []
      },
      trends: {
        articleCreation: Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)),
        viewsTrend: Array.from({ length: 12 }, () => Math.floor(Math.random() * 100)),
        searchTrend: Array.from({ length: 12 }, () => Math.floor(Math.random() * 50))
      }
    };
  }

  async exportKnowledgeBase(knowledgeBaseId: string, format: 'json' | 'markdown' | 'pdf', userId: string): Promise<string> {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
    }

    // Check permissions
    const collaborator = knowledgeBase.collaborators.get(userId);
    if (!collaborator || !collaborator.permissions.canExport) {
      throw new Error('Insufficient permissions to export knowledge base');
    }

    switch (format) {
      case 'json':
        return this.exportAsJSON(knowledgeBase);
      case 'markdown':
        return this.exportAsMarkdown(knowledgeBase);
      case 'pdf':
        return this.exportAsPDF(knowledgeBase);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async parseContentBlocks(content: string): Promise<ContentBlock[]> {
    // Parse markdown-like content into structured blocks
    const blocks: ContentBlock[] = [];
    const lines = content.split('\n');
    let currentBlock: Partial<ContentBlock> = {};
    let blockOrder = 0;

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (currentBlock.type === 'code') {
          // End code block
          blocks.push({
            id: this.generateBlockId(),
            type: 'code',
            content: currentBlock.content || '',
            metadata: currentBlock.metadata || {},
            order: blockOrder++
          });
          currentBlock = {};
        } else {
          // Start code block
          currentBlock = {
            type: 'code',
            content: '',
            metadata: { language: line.substring(3) }
          };
        }
      } else if (currentBlock.type === 'code') {
        currentBlock.content = (currentBlock.content || '') + line + '\n';
      } else {
        // Regular text
        if (currentBlock.type !== 'text') {
          currentBlock = { type: 'text', content: '' };
        }
        currentBlock.content = (currentBlock.content || '') + line + '\n';
      }
    }

    // Add final block
    if (currentBlock.content) {
      blocks.push({
        id: this.generateBlockId(),
        type: currentBlock.type || 'text',
        content: currentBlock.content,
        metadata: currentBlock.metadata || {},
        order: blockOrder++
      });
    }

    return blocks;
  }

  private countWords(content: string): number {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateReadTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = this.countWords(content);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  private canUserAccessKnowledgeBase(knowledgeBase: KnowledgeBase, userId?: string): boolean {
    if (knowledgeBase.visibility === 'public') return true;
    if (!userId) return knowledgeBase.settings.general.allowAnonymousViewing;
    
    return knowledgeBase.collaborators.has(userId) || knowledgeBase.ownerId === userId;
  }

  private canUserAccessArticle(article: Article, userId?: string): boolean {
    if (article.visibility === 'public') return true;
    if (article.status !== 'published') return false;
    if (!userId) return false;
    
    return article.visibility === 'team' || article.authorId === userId;
  }

  private updateHelpfulnessScore(knowledgeBase: KnowledgeBase): void {
    const articles = Array.from(knowledgeBase.articles.values());
    const totalVotes = articles.reduce((sum, article) => 
      sum + article.analytics.helpfulVotes + article.analytics.unhelpfulVotes, 0
    );
    const helpfulVotes = articles.reduce((sum, article) => 
      sum + article.analytics.helpfulVotes, 0
    );
    
    knowledgeBase.metrics.helpfulnessScore = totalVotes > 0 ? (helpfulVotes / totalVotes) * 100 : 0;
  }

  private createDefaultCategories(knowledgeBaseId: string): void {
    const knowledgeBase = this.knowledgeBases.get(knowledgeBaseId);
    if (!knowledgeBase) return;

    const defaultCategories = [
      { name: 'General', description: 'General knowledge and guides' },
      { name: 'Tutorials', description: 'Step-by-step tutorials' },
      { name: 'Best Practices', description: 'Recommended approaches and patterns' },
      { name: 'Troubleshooting', description: 'Problem-solving guides' },
      { name: 'FAQ', description: 'Frequently asked questions' }
    ];

    defaultCategories.forEach(cat => {
      const category: Category = {
        id: this.generateCategoryId(),
        name: cat.name,
        description: cat.description,
        articleCount: 0,
        subcategories: [],
        moderators: [knowledgeBase.ownerId],
        settings: {
          requireApproval: false,
          allowContributions: true,
          autoTag: []
        }
      };
      knowledgeBase.categories.set(category.id, category);
    });
  }

  private mergeWithDefaultSettings(settings?: Partial<KnowledgeBaseSettings>): KnowledgeBaseSettings {
    const defaultSettings: KnowledgeBaseSettings = {
      general: {
        allowAnonymousViewing: false,
        requireApprovalForNew: true,
        enableComments: true,
        enableReactions: true,
        enableVersioning: true,
        defaultLanguage: 'en'
      },
      ai: {
        enableAutoSuggestions: true,
        enableContentAnalysis: true,
        enableSmartSearch: true,
        autoGenerateSummaries: true,
        suggestRelatedContent: true,
        qualityThreshold: 0.7
      },
      moderation: {
        autoModeration: true,
        flaggedContentThreshold: 3,
        spamDetection: true,
        profanityFilter: true
      },
      notifications: {
        newArticleNotifications: true,
        commentNotifications: true,
        weeklyDigest: true,
        channels: ['email', 'in-app']
      },
      search: {
        enableFullTextSearch: true,
        indexUpdateFrequency: 'realtime',
        searchResultsPerPage: 20,
        enableAutoComplete: true
      }
    };

    return this.deepMerge(defaultSettings, settings || {});
  }

  private getAdminPermissions(): Collaborator['permissions'] {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canModerate: true,
      canInvite: true,
      canExport: true
    };
  }

  private exportAsJSON(knowledgeBase: KnowledgeBase): string {
    const exportData = {
      ...knowledgeBase,
      categories: Array.from(knowledgeBase.categories.entries()),
      articles: Array.from(knowledgeBase.articles.entries()),
      tags: Array.from(knowledgeBase.tags),
      collaborators: Array.from(knowledgeBase.collaborators.entries())
    };
    return JSON.stringify(exportData, null, 2);
  }

  private exportAsMarkdown(knowledgeBase: KnowledgeBase): string {
    let markdown = `# ${knowledgeBase.name}\n\n`;
    if (knowledgeBase.description) {
      markdown += `${knowledgeBase.description}\n\n`;
    }

    // Export articles by category
    for (const [categoryId, category] of knowledgeBase.categories) {
      const categoryArticles = Array.from(knowledgeBase.articles.values())
        .filter(article => article.categoryId === categoryId);
      
      if (categoryArticles.length > 0) {
        markdown += `## ${category.name}\n\n`;
        
        categoryArticles.forEach(article => {
          markdown += `### ${article.title}\n\n`;
          markdown += `${article.content}\n\n`;
        });
      }
    }

    return markdown;
  }

  private exportAsPDF(knowledgeBase: KnowledgeBase): string {
    // Mock implementation - would use a PDF generation library
    return `PDF export of ${knowledgeBase.name} (${knowledgeBase.metrics.totalArticles} articles)`;
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private loadKnowledgeBases(): void {
    // Load from persistent storage
  }

  private generateKnowledgeBaseId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateArticleId(): string {
    return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCategoryId(): string {
    return `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCommentId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBlockId(): string {
    return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting classes
class SearchIndex {
  async indexArticle(article: Article, knowledgeBase: KnowledgeBase): Promise<void> {
    // Index article for full-text search
  }

  async search(knowledgeBase: KnowledgeBase, query: SearchQuery): Promise<SearchResult> {
    // Perform search and return results
    return {
      articles: [],
      total: 0,
      facets: {
        categories: {},
        tags: {},
        authors: {},
        types: {}
      },
      suggestions: [],
      relatedQueries: []
    };
  }
}

class AIContentAnalyzer {
  async generateSummary(content: string): Promise<string> {
    // Generate AI summary
    return content.substring(0, 200) + '...';
  }

  async analyzeContent(content: string): Promise<Article['ai_insights']> {
    // Analyze content and extract insights
    return {
      topics: [],
      concepts: [],
      relatedArticles: [],
      suggestedUpdates: [],
      qualityScore: 0.8,
      completenessScore: 0.7
    };
  }

  async getRecommendations(article: Article, knowledgeBase: KnowledgeBase): Promise<Article[]> {
    // Generate content recommendations
    return [];
  }
}

class ContentModerator {
  async checkContent(article: Article): Promise<{ approved: boolean; issues: string[] }> {
    // Check content for policy violations
    return { approved: true, issues: [] };
  }

  async checkComment(comment: Comment): Promise<{ approved: boolean; issues: string[] }> {
    // Check comment for policy violations
    return { approved: true, issues: [] };
  }
}

class NotificationService {
  async notifyNewArticle(knowledgeBase: KnowledgeBase, article: Article): Promise<void> {
    // Send notifications about new articles
  }
}