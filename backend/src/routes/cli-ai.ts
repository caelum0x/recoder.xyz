import express, { Request, Response } from 'express';
import * as cliAIService from '../services/cli-ai-service';
import { authenticateToken } from '../middleware/auth';
import { verifyCliSession } from '../services/cliAuth.service';

const router = express.Router();

/**
 * POST /api/cli/ai/complete
 * Make an AI completion request from CLI
 * Requires CLI authentication token
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required',
      });
    }

    const token = authHeader.substring(7);
    
    // Verify CLI session
    const verification = await verifyCliSession(token);
    
    if (!verification.valid || !verification.user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired CLI token',
      });
    }

    const { prompt, systemPrompt, model, maxTokens, temperature } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Prompt is required',
      });
    }

    // Make AI request
    const response = await cliAIService.makeAIRequest({
      userId: verification.user.id,
      prompt,
      systemPrompt,
      model,
      maxTokens,
      temperature,
    });

    res.json({
      success: true,
      data: {
        content: response.content,
        model: response.model,
        usage: response.usage,
        cost: response.cost,
      },
      metadata: response.metadata,
    });

  } catch (error: any) {
    console.error('CLI AI completion error:', error);
    
    // Handle budget exceeded errors specially
    if (error.message?.includes('budget limit') || error.message?.includes('request limit')) {
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'server_error',
      message: error.message || 'Failed to process AI request',
    });
  }
});

/**
 * GET /api/cli/ai/budget
 * Check user's current budget status
 */
router.get('/budget', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required',
      });
    }

    const token = authHeader.substring(7);
    
    // Verify CLI session
    const verification = await verifyCliSession(token);
    
    if (!verification.valid || !verification.user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired CLI token',
      });
    }

    const budgetCheck = await cliAIService.checkUserBudget(verification.user.id);

    res.json({
      success: true,
      budget: {
        allowed: budgetCheck.allowed,
        reason: budgetCheck.reason,
        plan: budgetCheck.plan,
        current: {
          daily: budgetCheck.currentDailySpend,
          monthly: budgetCheck.currentMonthlySpend,
        },
        remaining: {
          daily: budgetCheck.remainingDailyBudget,
          monthly: budgetCheck.remainingMonthlyBudget,
        },
      },
    });

  } catch (error: any) {
    console.error('Budget check error:', error);
    
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to check budget',
    });
  }
});

/**
 * GET /api/cli/ai/usage
 * Get detailed usage statistics
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required',
      });
    }

    const token = authHeader.substring(7);
    
    // Verify CLI session
    const verification = await verifyCliSession(token);
    
    if (!verification.valid || !verification.user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired CLI token',
      });
    }

    const stats = await cliAIService.getUserUsageStats(verification.user.id);

    res.json({
      success: true,
      usage: stats,
    });

  } catch (error: any) {
    console.error('Usage stats error:', error);
    
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get usage statistics',
    });
  }
});

/**
 * GET /api/cli/ai/models
 * Get available AI models based on user's plan
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required',
      });
    }

    const token = authHeader.substring(7);
    
    // Verify CLI session
    const verification = await verifyCliSession(token);
    
    if (!verification.valid || !verification.user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired CLI token',
      });
    }

    const budgetCheck = await cliAIService.checkUserBudget(verification.user.id);
    const plan = budgetCheck.plan;

    // Define models by category
    const allModels = [
      // Top tier - Best quality
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (Latest)', category: 'premium', pricing: cliAIService.PRICING['anthropic/claude-sonnet-4.5'] },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (Primary)', category: 'pro', pricing: cliAIService.PRICING['anthropic/claude-sonnet-4'] },
      
      // Code specialists
      { id: 'x-ai/grok-code-fast-1', name: 'Grok Code Fast', category: 'code', pricing: cliAIService.PRICING['x-ai/grok-code-fast-1'] },
      { id: 'qwen/qwen3-coder-480b-a35b', name: 'Qwen3 Coder 480B', category: 'code', pricing: cliAIService.PRICING['qwen/qwen3-coder-480b-a35b'] },
      
      // Fast & economical
      { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast', category: 'fast', pricing: cliAIService.PRICING['x-ai/grok-4-fast'] },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'fast', pricing: cliAIService.PRICING['google/gemini-2.5-flash'] },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash (Free)', category: 'free', pricing: cliAIService.PRICING['google/gemini-2.0-flash'] },
      
      // Advanced models
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', category: 'premium', pricing: cliAIService.PRICING['google/gemini-2.5-pro'] },
      { id: 'openai/gpt-5', name: 'GPT-5', category: 'premium', pricing: cliAIService.PRICING['openai/gpt-5'] },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', pricing: cliAIService.PRICING['openai/gpt-4.1-mini'] },
      
      // Budget options
      { id: 'deepseek/deepseek-v3-0324', name: 'DeepSeek V3', category: 'budget', pricing: cliAIService.PRICING['deepseek/deepseek-v3-0324'] },
      { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', category: 'budget', pricing: cliAIService.PRICING['openai/gpt-oss-20b'] },
      { id: 'z-ai/glm-4.6', name: 'GLM 4.6', category: 'budget', pricing: cliAIService.PRICING['z-ai/glm-4.6'] },
      
      // Specialty
      { id: 'openrouter/sonoma-sky-alpha', name: 'Sonoma Sky Alpha', category: 'specialty', pricing: cliAIService.PRICING['openrouter/sonoma-sky-alpha'] },
    ];

    // Filter based on plan
    const availableModels = plan === 'free' 
      ? allModels.filter(m => m.category === 'free')
      : allModels;

    res.json({
      success: true,
      plan,
      defaultModel: cliAIService.PLAN_LIMITS[plan as keyof typeof cliAIService.PLAN_LIMITS]?.defaultModel || 'google/gemini-2.0-flash',
      models: availableModels,
      categories: {
        premium: 'Highest quality, best for complex tasks',
        pro: 'Excellent quality, recommended for most uses',
        code: 'Optimized for code generation',
        fast: 'Quick responses, good value',
        budget: 'Most economical options',
        specialty: 'Specialized models',
        free: 'Free tier models',
      },
    });

  } catch (error: any) {
    console.error('Models list error:', error);
    
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get available models',
    });
  }
});

/**
 * GET /api/cli/ai/pricing
 * Get current pricing for all models
 */
router.get('/pricing', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      pricing: cliAIService.PRICING,
      plans: cliAIService.PLAN_LIMITS,
    });

  } catch (error: any) {
    console.error('Pricing info error:', error);
    
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to get pricing information',
    });
  }
});

export default router;
