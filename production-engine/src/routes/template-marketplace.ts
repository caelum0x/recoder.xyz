/**
 * Template Marketplace API Routes for Recoder.ai DaaS Platform
 * Handles template discovery, purchases, submissions, and marketplace features
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { templateMarketplaceService } from '../services/template-marketplace-service';
import { userService } from '../services/user-service';

const router = Router();

// Authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  if (!token && !userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  req.userId = userId || 'demo-user';
  next();
};

// Optional authentication for public endpoints
const optionalAuth = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  req.userId = userId || null;
  next();
};

// =============================================================================
// TEMPLATE DISCOVERY ROUTES
// =============================================================================

/**
 * GET /api/templates
 * Search and browse templates
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      q: query,
      category,
      framework,
      difficulty,
      pricing = 'all',
      rating,
      sortBy = 'popular',
      limit = '20',
      offset = '0'
    } = req.query;

    const result = templateMarketplaceService.searchTemplates(
      query as string,
      {
        category: category as string,
        framework: framework as string,
        difficulty: difficulty as string,
        pricing: pricing as 'free' | 'premium' | 'all',
        rating: rating ? parseFloat(rating as string) : undefined,
        sortBy: sortBy as 'popular' | 'recent' | 'rating' | 'downloads',
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    );

    res.json({
      success: true,
      data: {
        templates: result.templates,
        total: result.total,
        facets: result.facets,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: result.total,
          hasMore: result.total > parseInt(offset as string) + parseInt(limit as string)
        }
      }
    });

  } catch (error: any) {
    logger.error('Search templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/templates/featured
 * Get featured templates
 */
router.get('/featured', optionalAuth, async (req, res) => {
  try {
    const { limit = '10' } = req.query;
    
    const featuredTemplates = templateMarketplaceService.getFeaturedTemplates(
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: {
        templates: featuredTemplates,
        total: featuredTemplates.length
      }
    });

  } catch (error: any) {
    logger.error('Get featured templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/templates/:templateId
 * Get template details
 */
router.get('/:templateId', optionalAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const template = templateMarketplaceService.getTemplate(templateId, req.userId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: template
    });

  } catch (error: any) {
    logger.error('Get template details failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TEMPLATE USAGE ROUTES
// =============================================================================

/**
 * POST /api/templates/:templateId/use
 * Use/download template
 */
router.post('/:templateId/use', authenticate, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { projectName } = req.body;

    const result = await templateMarketplaceService.useTemplate(
      req.userId,
      templateId,
      projectName
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'TEMPLATE_USE_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        files: result.files,
        instructions: result.instructions
      },
      message: 'Template ready to use! Files generated successfully 🚀'
    });

  } catch (error: any) {
    logger.error('Use template failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/templates/:templateId/purchase
 * Purchase premium template
 */
router.post('/:templateId/purchase', authenticate, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { paymentMethod, transactionId } = req.body;

    if (!paymentMethod || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Payment method and transaction ID are required',
        code: 'MISSING_PAYMENT_INFO'
      });
    }

    const result = await templateMarketplaceService.purchaseTemplate(
      req.userId,
      templateId,
      { paymentMethod, transactionId }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'PURCHASE_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.purchase,
      message: 'Template purchased successfully! You can now use it unlimited times 🎉'
    });

  } catch (error: any) {
    logger.error('Purchase template failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/templates/:templateId/reviews
 * Add template review
 */
router.post('/:templateId/reviews', authenticate, async (req, res) => {
  try {
    const { templateId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Valid rating (1-5) is required',
        code: 'INVALID_RATING'
      });
    }

    if (!comment || comment.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Comment must be at least 10 characters long',
        code: 'INVALID_COMMENT'
      });
    }

    const result = await templateMarketplaceService.addTemplateReview(
      req.userId,
      templateId,
      { rating, comment }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'REVIEW_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.review,
      message: 'Thank you for your review! ⭐'
    });

  } catch (error: any) {
    logger.error('Add template review failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TEMPLATE SUBMISSION ROUTES
// =============================================================================

/**
 * POST /api/templates/submit
 * Submit new template to marketplace
 */
router.post('/submit', authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      shortDescription,
      category,
      subcategory,
      framework,
      language,
      difficulty,
      features,
      technologies,
      tags,
      templateCode,
      thumbnailUrl,
      screenshots = [],
      demoUrl,
      pricing,
      files,
      installation,
      license = 'MIT'
    } = req.body;

    // Validate required fields
    if (!name || !description || !category || !framework || !templateCode) {
      return res.status(400).json({
        success: false,
        error: 'Name, description, category, framework, and template code are required',
        code: 'MISSING_FIELDS'
      });
    }

    if (!Array.isArray(features) || !Array.isArray(technologies) || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'Features, technologies, and files must be arrays',
        code: 'INVALID_ARRAYS'
      });
    }

    const result = await templateMarketplaceService.submitTemplate(req.userId, {
      name,
      description,
      shortDescription: shortDescription || description.substring(0, 100),
      category,
      subcategory: subcategory || 'General',
      framework,
      language: language || 'JavaScript',
      difficulty: difficulty || 'beginner',
      features,
      technologies,
      tags: tags || [],
      templateCode,
      thumbnailUrl: thumbnailUrl || '/templates/default-thumbnail.jpg',
      screenshots,
      demoUrl,
      pricing: pricing || { type: 'free', price: 0, currency: 'USD' },
      files,
      installation: installation || {
        requirements: ['Node.js 18+'],
        steps: ['Install dependencies', 'Run development server'],
        configNeeded: false
      },
      license
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'SUBMISSION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: result.template,
      message: 'Template submitted successfully! It will be reviewed within 24-48 hours 📝'
    });

  } catch (error: any) {
    logger.error('Submit template failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// MARKETPLACE ANALYTICS ROUTES
// =============================================================================

/**
 * GET /api/templates/analytics/marketplace
 * Get marketplace analytics (public overview)
 */
router.get('/analytics/marketplace', optionalAuth, async (req, res) => {
  try {
    const analytics = templateMarketplaceService.getMarketplaceAnalytics();

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get marketplace analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TEMPLATE CATEGORIES AND FILTERS ROUTES
// =============================================================================

/**
 * GET /api/templates/categories
 * Get template categories and metadata
 */
router.get('/categories', optionalAuth, async (req, res) => {
  try {
    const categories = [
      {
        id: 'web',
        name: 'Web Applications',
        description: 'Modern web applications and SPAs',
        icon: '🌐',
        count: 150,
        popular: true,
        subcategories: ['Landing Page', 'Dashboard', 'Portfolio', 'Blog']
      },
      {
        id: 'saas',
        name: 'SaaS Platforms',
        description: 'Software-as-a-Service applications',
        icon: '🚀',
        count: 89,
        popular: true,
        subcategories: ['Starter Kit', 'CRM', 'Analytics', 'Management']
      },
      {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Online stores and marketplaces',
        icon: '🛒',
        count: 76,
        popular: true,
        subcategories: ['Store', 'Marketplace', 'Payment', 'Inventory']
      },
      {
        id: 'mobile',
        name: 'Mobile Apps',
        description: 'React Native and mobile solutions',
        icon: '📱',
        count: 64,
        popular: false,
        subcategories: ['iOS', 'Android', 'Cross-platform', 'PWA']
      },
      {
        id: 'blockchain',
        name: 'Blockchain',
        description: 'DeFi, NFT, and Web3 applications',
        icon: '⛓️',
        count: 42,
        popular: false,
        subcategories: ['DeFi', 'NFT', 'DAO', 'DApp']
      },
      {
        id: 'ai',
        name: 'AI/ML',
        description: 'Artificial Intelligence applications',
        icon: '🤖',
        count: 38,
        popular: true,
        subcategories: ['ChatBot', 'Image Processing', 'Analytics', 'Automation']
      },
      {
        id: 'backend',
        name: 'Backend Services',
        description: 'APIs and server-side applications',
        icon: '⚙️',
        count: 95,
        popular: false,
        subcategories: ['REST API', 'GraphQL', 'Microservices', 'Database']
      },
      {
        id: 'fullstack',
        name: 'Full-stack',
        description: 'Complete applications with frontend and backend',
        icon: '🔧',
        count: 67,
        popular: true,
        subcategories: ['CRUD App', 'Social Platform', 'Management System', 'Real-time App']
      }
    ];

    const frameworks = [
      { name: 'React', count: 234, icon: '⚛️' },
      { name: 'Next.js', count: 189, icon: '▲' },
      { name: 'Vue.js', count: 145, icon: '🖖' },
      { name: 'Angular', count: 98, icon: '🅰️' },
      { name: 'Svelte', count: 67, icon: '🧡' },
      { name: 'Node.js', count: 156, icon: '🟢' },
      { name: 'React Native', count: 89, icon: '📱' },
      { name: 'Flutter', count: 45, icon: '🐦' }
    ];

    const languages = [
      { name: 'JavaScript', count: 345, icon: '🟨' },
      { name: 'TypeScript', count: 289, icon: '🔷' },
      { name: 'Python', count: 67, icon: '🐍' },
      { name: 'Java', count: 43, icon: '☕' },
      { name: 'Go', count: 32, icon: '🐹' },
      { name: 'Rust', count: 21, icon: '🦀' }
    ];

    res.json({
      success: true,
      data: {
        categories,
        frameworks,
        languages,
        totalTemplates: categories.reduce((sum, cat) => sum + cat.count, 0)
      }
    });

  } catch (error: any) {
    logger.error('Get template categories failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/templates/trending
 * Get trending templates
 */
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { timeframe = 'week', limit = '10' } = req.query;
    
    const analytics = templateMarketplaceService.getMarketplaceAnalytics();
    const trending = analytics.trending.topTemplates.slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: {
        templates: trending,
        timeframe,
        total: trending.length,
        lastUpdated: new Date()
      }
    });

  } catch (error: any) {
    logger.error('Get trending templates failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// TEMPLATE GENERATOR ROUTES
// =============================================================================

/**
 * POST /api/templates/generate-from-template
 * Generate project using template
 */
router.post('/generate-from-template', authenticate, async (req, res) => {
  try {
    const {
      templateId,
      projectName,
      customizations = {},
      outputPath = './generated'
    } = req.body;

    if (!templateId || !projectName) {
      return res.status(400).json({
        success: false,
        error: 'Template ID and project name are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Use template to get files
    const templateResult = await templateMarketplaceService.useTemplate(
      req.userId,
      templateId,
      projectName
    );

    if (!templateResult.success) {
      return res.status(400).json({
        success: false,
        error: templateResult.error,
        code: 'TEMPLATE_USE_FAILED'
      });
    }

    // Apply customizations to files
    const customizedFiles = templateResult.files?.map(file => ({
      ...file,
      content: applyCustomizations(file.content, customizations)
    }));

    res.json({
      success: true,
      data: {
        files: customizedFiles,
        instructions: templateResult.instructions,
        metadata: {
          templateId,
          projectName,
          generatedAt: new Date(),
          customizations
        }
      },
      message: `Project "${projectName}" generated successfully from template! 🎉`
    });

  } catch (error: any) {
    logger.error('Generate from template failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// Helper function for applying customizations
function applyCustomizations(content: string, customizations: Record<string, any>): string {
  let customizedContent = content;
  
  Object.entries(customizations).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{${key.toUpperCase()}}}`, 'g');
    customizedContent = customizedContent.replace(placeholder, value);
  });
  
  return customizedContent;
}

export default router;