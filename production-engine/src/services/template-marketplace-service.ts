/**
 * Template Marketplace Service for Recoder.ai DaaS Platform
 * Handles template discovery, creation, sales, and marketplace features
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { projectService } from './project-service';

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  
  // Creator information
  creatorId: string;
  creatorUsername: string;
  creatorVerified: boolean;
  
  // Template details
  category: 'web' | 'mobile' | 'backend' | 'fullstack' | 'blockchain' | 'ai' | 'saas' | 'ecommerce';
  subcategory: string;
  framework: string;
  language: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  
  // Content
  features: string[];
  technologies: string[];
  tags: string[];
  templateCode: string; // AI prompt/instructions
  
  // Media
  thumbnailUrl: string;
  screenshots: string[];
  demoUrl?: string;
  videoUrl?: string;
  
  // Marketplace data
  pricing: {
    type: 'free' | 'premium' | 'freemium';
    price: number; // USD cents
    currency: 'USD';
    subscriptionType?: 'one-time' | 'monthly' | 'yearly';
  };
  
  // Usage data
  downloads: number;
  uses: number;
  rating: number;
  reviewCount: number;
  
  // Quality metrics
  qualityScore: number; // 0-100
  codeQuality: number;
  documentation: number;
  completeness: number;
  
  // Reviews and feedback
  reviews: Array<{
    id: string;
    userId: string;
    username: string;
    rating: number;
    comment: string;
    helpful: number;
    createdAt: Date;
  }>;
  
  // Template files
  files: Array<{
    path: string;
    content: string;
    type: 'code' | 'config' | 'documentation' | 'asset';
    language: string;
    description?: string;
  }>;
  
  // Installation/setup
  installation: {
    requirements: string[];
    steps: string[];
    configNeeded: boolean;
    envVars?: Array<{
      name: string;
      description: string;
      required: boolean;
      example?: string;
    }>;
  };
  
  // License and terms
  license: 'MIT' | 'Apache-2.0' | 'GPL-3.0' | 'Commercial' | 'Custom';
  licenseUrl?: string;
  commercialUse: boolean;
  attribution: boolean;
  
  // Marketplace status
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'removed';
  moderationNotes?: string;
  
  // Analytics
  analytics: {
    views: number;
    weeklyViews: number;
    monthlyViews: number;
    conversionRate: number;
    revenue: number;
    refunds: number;
  };
  
  // Metadata
  version: string;
  lastUpdated: Date;
  createdAt: Date;
  isOfficial: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isTrending: boolean;
}

export interface TemplateCollection {
  id: string;
  name: string;
  description: string;
  curatorId: string;
  curatorUsername: string;
  
  // Collection details
  templateIds: string[];
  category: string;
  tags: string[];
  
  // Visibility
  isPublic: boolean;
  isOfficial: boolean;
  isCurated: boolean;
  
  // Stats
  followers: number;
  totalDownloads: number;
  
  // Media
  coverImage?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplatePurchase {
  id: string;
  userId: string;
  templateId: string;
  
  // Purchase details
  price: number;
  currency: string;
  paymentMethod: string;
  transactionId: string;
  
  // Status
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  
  // Usage rights
  licenseType: string;
  usageCount: number;
  maxUsage?: number;
  
  createdAt: Date;
  expiresAt?: Date;
}

export interface MarketplaceAnalytics {
  overview: {
    totalTemplates: number;
    totalCreators: number;
    totalDownloads: number;
    totalRevenue: number;
    averageRating: number;
  };
  
  trending: {
    topTemplates: Array<{
      template: MarketplaceTemplate;
      growthRate: number;
      downloads: number;
    }>;
    topCreators: Array<{
      userId: string;
      username: string;
      templates: number;
      revenue: number;
      rating: number;
    }>;
    categories: Array<{
      category: string;
      templates: number;
      downloads: number;
      revenue: number;
    }>;
  };
  
  quality: {
    averageQualityScore: number;
    highQualityTemplates: number;
    approvalRate: number;
    moderationQueue: number;
  };
}

export class TemplateMarketplaceService {
  private templates: Map<string, MarketplaceTemplate> = new Map();
  private collections: Map<string, TemplateCollection> = new Map();
  private purchases: Map<string, TemplatePurchase[]> = new Map(); // userId -> purchases
  private userTemplates: Map<string, string[]> = new Map(); // userId -> templateIds
  private categoryTemplates: Map<string, string[]> = new Map(); // category -> templateIds

  constructor() {
    this.initializeTemplateMarketplace();
  }

  private initializeTemplateMarketplace(): void {
    logger.info('🏪 Initializing Template Marketplace Service...');
    
    // Initialize popular templates
    this.initializePopularTemplates();
    
    // Initialize featured collections
    this.initializeFeaturedCollections();
    
    logger.info('✅ Template Marketplace Service initialized');
  }

  /**
   * Submit template to marketplace
   */
  async submitTemplate(
    creatorId: string,
    templateData: {
      name: string;
      description: string;
      shortDescription: string;
      category: MarketplaceTemplate['category'];
      subcategory: string;
      framework: string;
      language: string;
      difficulty: MarketplaceTemplate['difficulty'];
      features: string[];
      technologies: string[];
      tags: string[];
      templateCode: string;
      thumbnailUrl: string;
      screenshots: string[];
      demoUrl?: string;
      pricing: MarketplaceTemplate['pricing'];
      files: MarketplaceTemplate['files'];
      installation: MarketplaceTemplate['installation'];
      license: MarketplaceTemplate['license'];
    }
  ): Promise<{ success: boolean; template?: MarketplaceTemplate; error?: string }> {
    try {
      const creator = userService.getUserProfile(creatorId);
      if (!creator) {
        return { success: false, error: 'Creator not found' };
      }

      // Generate template ID
      const templateId = this.generateTemplateId();

      // Calculate initial quality score
      const qualityScore = this.calculateQualityScore(templateData);

      // Create template
      const template: MarketplaceTemplate = {
        id: templateId,
        name: templateData.name,
        description: templateData.description,
        shortDescription: templateData.shortDescription,
        creatorId,
        creatorUsername: creator.username,
        creatorVerified: false,
        category: templateData.category,
        subcategory: templateData.subcategory,
        framework: templateData.framework,
        language: templateData.language,
        difficulty: templateData.difficulty,
        features: templateData.features,
        technologies: templateData.technologies,
        tags: templateData.tags,
        templateCode: templateData.templateCode,
        thumbnailUrl: templateData.thumbnailUrl,
        screenshots: templateData.screenshots,
        demoUrl: templateData.demoUrl,
        pricing: templateData.pricing,
        downloads: 0,
        uses: 0,
        rating: 0,
        reviewCount: 0,
        qualityScore,
        codeQuality: qualityScore,
        documentation: this.assessDocumentationQuality(templateData),
        completeness: this.assessCompleteness(templateData),
        reviews: [],
        files: templateData.files,
        installation: templateData.installation,
        license: templateData.license,
        commercialUse: templateData.license !== 'GPL-3.0',
        attribution: templateData.license === 'MIT' || templateData.license === 'Apache-2.0',
        status: 'pending',
        analytics: {
          views: 0,
          weeklyViews: 0,
          monthlyViews: 0,
          conversionRate: 0,
          revenue: 0,
          refunds: 0
        },
        version: '1.0.0',
        lastUpdated: new Date(),
        createdAt: new Date(),
        isOfficial: false,
        isFeatured: false,
        isNew: true,
        isTrending: false
      };

      // Store template
      this.templates.set(templateId, template);
      
      // Add to creator's templates
      if (!this.userTemplates.has(creatorId)) {
        this.userTemplates.set(creatorId, []);
      }
      this.userTemplates.get(creatorId)!.push(templateId);

      // Add to category index
      if (!this.categoryTemplates.has(templateData.category)) {
        this.categoryTemplates.set(templateData.category, []);
      }
      this.categoryTemplates.get(templateData.category)!.push(templateId);

      logger.info(`📤 Template submitted: ${template.name} by ${creator.username}`);

      return { success: true, template };

    } catch (error: any) {
      logger.error('Submit template failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search templates in marketplace
   */
  searchTemplates(
    query?: string,
    filters?: {
      category?: string;
      framework?: string;
      difficulty?: string;
      pricing?: 'free' | 'premium' | 'all';
      rating?: number;
      sortBy?: 'popular' | 'recent' | 'rating' | 'downloads';
      limit?: number;
      offset?: number;
    }
  ): {
    templates: MarketplaceTemplate[];
    total: number;
    facets: {
      categories: Array<{ name: string; count: number }>;
      frameworks: Array<{ name: string; count: number }>;
      pricing: Array<{ type: string; count: number }>;
    };
  } {
    let templates = Array.from(this.templates.values())
      .filter(t => t.status === 'approved');

    // Apply text search
    if (query) {
      const searchLower = query.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        t.features.some(feature => feature.toLowerCase().includes(searchLower))
      );
    }

    // Apply filters
    if (filters) {
      if (filters.category && filters.category !== 'all') {
        templates = templates.filter(t => t.category === filters.category);
      }
      if (filters.framework && filters.framework !== 'all') {
        templates = templates.filter(t => t.framework.toLowerCase() === filters.framework!.toLowerCase());
      }
      if (filters.difficulty && filters.difficulty !== 'all') {
        templates = templates.filter(t => t.difficulty === filters.difficulty);
      }
      if (filters.pricing && filters.pricing !== 'all') {
        templates = templates.filter(t => t.pricing.type === filters.pricing);
      }
      if (filters.rating) {
        templates = templates.filter(t => t.rating >= filters.rating!);
      }
    }

    // Sort templates
    const sortBy = filters?.sortBy || 'popular';
    templates.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'rating':
          return b.rating - a.rating;
        case 'downloads':
          return b.downloads - a.downloads;
        default: // popular
          return (b.downloads * 0.4 + b.rating * 20 + b.uses * 0.1) - 
                 (a.downloads * 0.4 + a.rating * 20 + a.uses * 0.1);
      }
    });

    const total = templates.length;

    // Apply pagination
    if (filters?.limit) {
      const offset = filters.offset || 0;
      templates = templates.slice(offset, offset + filters.limit);
    }

    // Generate facets
    const allTemplates = Array.from(this.templates.values()).filter(t => t.status === 'approved');
    const facets = {
      categories: this.generateFacets(allTemplates, 'category'),
      frameworks: this.generateFacets(allTemplates, 'framework'),
      pricing: this.generateFacets(allTemplates, t => t.pricing.type).map(f => ({ type: f.name, count: f.count }))
    };

    return { templates, total, facets };
  }

  /**
   * Get template details
   */
  getTemplate(templateId: string, userId?: string): MarketplaceTemplate | null {
    const template = this.templates.get(templateId);
    if (!template || template.status !== 'approved') {
      return null;
    }

    // Increment view count
    template.analytics.views += 1;
    template.analytics.weeklyViews += 1;
    template.analytics.monthlyViews += 1;

    return template;
  }

  /**
   * Purchase template
   */
  async purchaseTemplate(
    userId: string,
    templateId: string,
    paymentData: {
      paymentMethod: string;
      transactionId: string;
    }
  ): Promise<{ success: boolean; purchase?: TemplatePurchase; error?: string }> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }

      if (template.pricing.type === 'free') {
        return { success: false, error: 'Free templates do not require purchase' };
      }

      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if already purchased
      const userPurchases = this.purchases.get(userId) || [];
      const existingPurchase = userPurchases.find(p => 
        p.templateId === templateId && p.status === 'completed'
      );

      if (existingPurchase) {
        return { success: false, error: 'Template already purchased' };
      }

      // Create purchase record
      const purchaseId = this.generatePurchaseId();
      const purchase: TemplatePurchase = {
        id: purchaseId,
        userId,
        templateId,
        price: template.pricing.price,
        currency: template.pricing.currency,
        paymentMethod: paymentData.paymentMethod,
        transactionId: paymentData.transactionId,
        status: 'completed',
        licenseType: template.license,
        usageCount: 0,
        createdAt: new Date()
      };

      // Store purchase
      if (!this.purchases.has(userId)) {
        this.purchases.set(userId, []);
      }
      this.purchases.get(userId)!.push(purchase);

      // Update template analytics
      template.downloads += 1;
      template.analytics.revenue += template.pricing.price / 100; // Convert cents to dollars

      logger.info(`💰 Template purchased: ${template.name} by ${user.username}`);

      return { success: true, purchase };

    } catch (error: any) {
      logger.error('Purchase template failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download/use template
   */
  async useTemplate(
    userId: string,
    templateId: string,
    projectName?: string
  ): Promise<{ success: boolean; files?: any[]; instructions?: string; error?: string }> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }

      // Check access rights
      if (template.pricing.type !== 'free') {
        const userPurchases = this.purchases.get(userId) || [];
        const validPurchase = userPurchases.find(p => 
          p.templateId === templateId && p.status === 'completed'
        );

        if (!validPurchase) {
          return { success: false, error: 'Template not purchased' };
        }

        // Update usage count
        validPurchase.usageCount += 1;
      }

      // Update template usage stats
      template.uses += 1;

      // Return template files and instructions
      const files = template.files.map(file => ({
        path: file.path,
        content: file.content.replace(/{{PROJECT_NAME}}/g, projectName || 'MyProject'),
        type: file.type,
        language: file.language
      }));

      const instructions = `# ${template.name}

${template.description}

## Installation

${template.installation.steps.join('\n')}

## Features

${template.features.map(f => `- ${f}`).join('\n')}

## Technologies Used

${template.technologies.map(t => `- ${t}`).join('\n')}

Generated from template: ${template.name} v${template.version}
Creator: ${template.creatorUsername}
License: ${template.license}
`;

      logger.info(`📥 Template used: ${template.name} by user ${userId}`);

      return { success: true, files, instructions };

    } catch (error: any) {
      logger.error('Use template failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add template review
   */
  async addTemplateReview(
    userId: string,
    templateId: string,
    reviewData: {
      rating: number;
      comment: string;
    }
  ): Promise<{ success: boolean; review?: any; error?: string }> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }

      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if user has used this template
      const userPurchases = this.purchases.get(userId) || [];
      const hasAccess = template.pricing.type === 'free' || 
        userPurchases.some(p => p.templateId === templateId && p.status === 'completed');

      if (!hasAccess) {
        return { success: false, error: 'Must purchase template before reviewing' };
      }

      // Check if already reviewed
      const existingReview = template.reviews.find(r => r.userId === userId);
      if (existingReview) {
        return { success: false, error: 'Already reviewed this template' };
      }

      // Create review
      const reviewId = this.generateReviewId();
      const review = {
        id: reviewId,
        userId,
        username: user.username,
        rating: reviewData.rating,
        comment: reviewData.comment,
        helpful: 0,
        createdAt: new Date()
      };

      // Add review to template
      template.reviews.push(review);
      template.reviewCount += 1;

      // Update template rating
      const totalRating = template.reviews.reduce((sum, r) => sum + r.rating, 0);
      template.rating = totalRating / template.reviews.length;

      logger.info(`⭐ Review added: ${reviewData.rating}/5 for ${template.name}`);

      return { success: true, review };

    } catch (error: any) {
      logger.error('Add template review failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get featured templates
   */
  getFeaturedTemplates(limit: number = 10): MarketplaceTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => t.status === 'approved' && (t.isFeatured || t.isOfficial))
      .sort((a, b) => {
        // Prioritize official, then featured, then by quality
        if (a.isOfficial !== b.isOfficial) return b.isOfficial ? 1 : -1;
        if (a.isFeatured !== b.isFeatured) return b.isFeatured ? 1 : -1;
        return b.qualityScore - a.qualityScore;
      })
      .slice(0, limit);
  }

  /**
   * Get marketplace analytics
   */
  getMarketplaceAnalytics(): MarketplaceAnalytics {
    const allTemplates = Array.from(this.templates.values())
      .filter(t => t.status === 'approved');

    const totalRevenue = allTemplates.reduce((sum, t) => sum + t.analytics.revenue, 0);
    const totalRating = allTemplates.reduce((sum, t) => sum + t.rating, 0);

    // Get unique creators
    const creators = new Set(allTemplates.map(t => t.creatorId));

    // Calculate trending templates
    const trendingTemplates = allTemplates
      .map(template => ({
        template,
        growthRate: template.analytics.weeklyViews / Math.max(template.analytics.monthlyViews - template.analytics.weeklyViews, 1),
        downloads: template.downloads
      }))
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 10);

    return {
      overview: {
        totalTemplates: allTemplates.length,
        totalCreators: creators.size,
        totalDownloads: allTemplates.reduce((sum, t) => sum + t.downloads, 0),
        totalRevenue,
        averageRating: totalRating / allTemplates.length || 0
      },
      trending: {
        topTemplates: trendingTemplates,
        topCreators: [], // Would be calculated from actual data
        categories: this.getCategoryStats()
      },
      quality: {
        averageQualityScore: allTemplates.reduce((sum, t) => sum + t.qualityScore, 0) / allTemplates.length || 0,
        highQualityTemplates: allTemplates.filter(t => t.qualityScore >= 80).length,
        approvalRate: 85, // Mock data
        moderationQueue: Array.from(this.templates.values()).filter(t => t.status === 'pending').length
      }
    };
  }

  private calculateQualityScore(templateData: any): number {
    let score = 0;
    
    // Name and description quality
    score += templateData.name.length > 5 ? 10 : 5;
    score += templateData.description.length > 100 ? 15 : 10;
    
    // Features and technologies
    score += Math.min(templateData.features.length * 5, 20);
    score += Math.min(templateData.technologies.length * 3, 15);
    
    // Files and completeness
    score += Math.min(templateData.files.length * 2, 20);
    
    // Installation instructions
    score += templateData.installation.steps.length > 3 ? 15 : 10;
    
    // Media quality
    score += templateData.screenshots.length > 0 ? 10 : 0;
    score += templateData.demoUrl ? 5 : 0;
    
    return Math.min(score, 100);
  }

  private assessDocumentationQuality(templateData: any): number {
    let score = 0;
    
    score += templateData.description.length > 200 ? 30 : 15;
    score += templateData.installation.steps.length > 3 ? 25 : 10;
    score += templateData.installation.requirements.length > 0 ? 15 : 0;
    score += templateData.features.length > 3 ? 20 : 10;
    score += templateData.files.some((f: any) => f.type === 'documentation') ? 10 : 0;
    
    return Math.min(score, 100);
  }

  private assessCompleteness(templateData: any): number {
    let score = 0;
    
    score += templateData.files.length > 5 ? 25 : 10;
    score += templateData.files.some((f: any) => f.type === 'config') ? 15 : 0;
    score += templateData.files.some((f: any) => f.path.includes('README')) ? 20 : 0;
    score += templateData.files.some((f: any) => f.path.includes('package.json')) ? 15 : 0;
    score += templateData.installation.envVars ? 15 : 0;
    score += templateData.demoUrl ? 10 : 0;
    
    return Math.min(score, 100);
  }

  private generateFacets(templates: MarketplaceTemplate[], accessor: string | ((t: MarketplaceTemplate) => string)): Array<{ name: string; count: number }> {
    const counts = new Map<string, number>();
    
    templates.forEach(template => {
      const value = typeof accessor === 'string' ? 
        (template as any)[accessor] : accessor(template);
      counts.set(value, (counts.get(value) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getCategoryStats(): Array<{ category: string; templates: number; downloads: number; revenue: number }> {
    const stats = new Map<string, { templates: number; downloads: number; revenue: number }>();
    
    Array.from(this.templates.values())
      .filter(t => t.status === 'approved')
      .forEach(template => {
        const existing = stats.get(template.category) || { templates: 0, downloads: 0, revenue: 0 };
        existing.templates += 1;
        existing.downloads += template.downloads;
        existing.revenue += template.analytics.revenue;
        stats.set(template.category, existing);
      });

    return Array.from(stats.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.templates - a.templates);
  }

  private initializePopularTemplates(): void {
    const popularTemplates = [
      {
        name: 'SaaS Starter Kit Pro',
        shortDescription: 'Complete SaaS application with authentication and billing',
        description: 'A comprehensive SaaS starter kit with user authentication, subscription billing, admin dashboard, and deployment ready configuration.',
        category: 'saas' as const,
        subcategory: 'Starter Kit',
        framework: 'Next.js',
        language: 'TypeScript',
        difficulty: 'intermediate' as const,
        features: ['Authentication', 'Stripe Integration', 'Admin Dashboard', 'Email System', 'Database Setup'],
        technologies: ['Next.js', 'TypeScript', 'Prisma', 'Stripe', 'Tailwind CSS'],
        pricing: { type: 'premium' as const, price: 4999, currency: 'USD' as const },
        license: 'Commercial' as const,
        qualityScore: 95
      },
      {
        name: 'E-commerce Store Template',
        shortDescription: 'Modern e-commerce store with cart and payments',
        description: 'Complete e-commerce solution with product catalog, shopping cart, payment processing, and order management.',
        category: 'ecommerce' as const,
        subcategory: 'Store',
        framework: 'React',
        language: 'JavaScript',
        difficulty: 'beginner' as const,
        features: ['Product Catalog', 'Shopping Cart', 'Payment Gateway', 'Order Tracking', 'Admin Panel'],
        technologies: ['React', 'Node.js', 'MongoDB', 'Stripe', 'Material-UI'],
        pricing: { type: 'free' as const, price: 0, currency: 'USD' as const },
        license: 'MIT' as const,
        qualityScore: 88
      }
    ];

    popularTemplates.forEach((templateData, index) => {
      const templateId = `popular_${index + 1}`;
      const template: MarketplaceTemplate = {
        id: templateId,
        ...templateData,
        creatorId: 'official',
        creatorUsername: 'Recoder.ai',
        creatorVerified: true,
        tags: [...templateData.technologies.map(t => t.toLowerCase()), templateData.category],
        templateCode: `Generate a ${templateData.name} with the following features: ${templateData.features.join(', ')}`,
        thumbnailUrl: `/templates/${templateId}/thumbnail.jpg`,
        screenshots: [`/templates/${templateId}/screenshot1.jpg`],
        downloads: 500 + Math.floor(Math.random() * 1500),
        uses: 300 + Math.floor(Math.random() * 800),
        rating: 4.5 + Math.random() * 0.5,
        reviewCount: 25 + Math.floor(Math.random() * 75),
        codeQuality: templateData.qualityScore,
        documentation: 90,
        completeness: 85,
        reviews: [],
        files: [
          {
            path: 'README.md',
            content: `# ${templateData.name}\n\n${templateData.description}`,
            type: 'documentation',
            language: 'markdown'
          }
        ],
        installation: {
          requirements: ['Node.js 18+', 'npm or yarn'],
          steps: ['Clone repository', 'Install dependencies', 'Configure environment', 'Run development server'],
          configNeeded: true
        },
        commercialUse: true,
        attribution: templateData.license === 'MIT',
        status: 'approved',
        analytics: {
          views: 1000 + Math.floor(Math.random() * 5000),
          weeklyViews: 100 + Math.floor(Math.random() * 300),
          monthlyViews: 500 + Math.floor(Math.random() * 1500),
          conversionRate: 5 + Math.random() * 10,
          revenue: templateData.pricing.price * (50 + Math.floor(Math.random() * 200)) / 100,
          refunds: 0
        },
        version: '1.0.0',
        lastUpdated: new Date(),
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random date in last 90 days
        isOfficial: true,
        isFeatured: true,
        isNew: false,
        isTrending: Math.random() > 0.5
      };

      this.templates.set(templateId, template);
      
      // Add to category index
      if (!this.categoryTemplates.has(template.category)) {
        this.categoryTemplates.set(template.category, []);
      }
      this.categoryTemplates.get(template.category)!.push(templateId);
    });

    logger.info(`🎯 Initialized ${popularTemplates.length} popular templates`);
  }

  private initializeFeaturedCollections(): void {
    const collections = [
      {
        name: 'SaaS Essentials',
        description: 'Everything you need to build and launch a SaaS product',
        category: 'saas',
        tags: ['saas', 'startup', 'mvp']
      },
      {
        name: 'E-commerce Complete',
        description: 'Build powerful online stores with these templates',
        category: 'ecommerce',
        tags: ['ecommerce', 'store', 'shopping']
      }
    ];

    collections.forEach((collectionData, index) => {
      const collectionId = `collection_${index + 1}`;
      const collection: TemplateCollection = {
        id: collectionId,
        ...collectionData,
        curatorId: 'official',
        curatorUsername: 'Recoder.ai',
        templateIds: Array.from(this.categoryTemplates.get(collectionData.category) || []),
        isPublic: true,
        isOfficial: true,
        isCurated: true,
        followers: 100 + Math.floor(Math.random() * 500),
        totalDownloads: 1000 + Math.floor(Math.random() * 5000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.collections.set(collectionId, collection);
    });

    logger.info(`📚 Initialized ${collections.length} featured collections`);
  }

  private generateTemplateId(): string {
    return 'tmpl_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private generatePurchaseId(): string {
    return 'purch_' + Math.random().toString(36).substring(2, 11);
  }

  private generateReviewId(): string {
    return 'rev_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const templateMarketplaceService = new TemplateMarketplaceService();