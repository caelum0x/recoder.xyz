/**
 * Analyze Edit Intent API
 *
 * Analyzes user prompts to determine edit intent and select relevant files.
 *
 * Endpoints:
 * - POST /api/analyze-edit-intent - Analyze a prompt and return edit intent
 *
 * Request body:
 * - prompt: string - The user's prompt to analyze
 * - projectId: string - The project ID to analyze in context of
 *
 * Response:
 * - success: boolean
 * - intent: EditIntent object with type, confidence, targetFiles, etc.
 * - error?: string
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  analyzeEditIntent,
  type EditIntent,
  EditType,
  formatIntentForDisplay,
  getAffectedFilesPreview,
} from '~/lib/services/edit-intent';
import { loadProjectContext, type ProjectContext } from '~/lib/services/code-context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AnalyzeEditIntent');

interface AnalyzeEditIntentRequest {
  prompt: string;
  projectId?: string;
  context?: ProjectContext | null;
}

interface AnalyzeEditIntentResponse {
  success: boolean;
  intent?: {
    type: string;
    targetFiles: string[];
    confidence: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    description: string;
    suggestedContext: string[];
    keywords: string[];
    formatted: string;
    preview: {
      willModify: string[];
      mayReference: string[];
      confidence: 'high' | 'medium' | 'low';
    };
  };
  error?: string;
}

/**
 * POST /api/analyze-edit-intent - Analyze edit intent from prompt
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  try {
    const body = (await request.json()) as AnalyzeEditIntentRequest;
    const { prompt, projectId, context: providedContext } = body;

    // Validate required fields
    if (!prompt) {
      return json<AnalyzeEditIntentResponse>(
        {
          success: false,
          error: 'prompt is required',
        },
        { status: 400 }
      );
    }

    logger.info('[analyze-edit-intent] Request received');
    logger.info('[analyze-edit-intent] Prompt:', prompt);
    logger.info('[analyze-edit-intent] ProjectId:', projectId || 'none');

    // Get project context - either provided or load from project
    let context: ProjectContext | null = null;

    if (providedContext) {
      // Use provided context directly
      context = providedContext;
      logger.info('[analyze-edit-intent] Using provided context');
    } else if (projectId) {
      // Load context from project
      try {
        context = await loadProjectContext(projectId);
        logger.info('[analyze-edit-intent] Loaded context for project:', projectId);
        logger.info('[analyze-edit-intent] Files count:', context?.files?.size || 0);
      } catch (contextError) {
        logger.warn('[analyze-edit-intent] Failed to load project context:', contextError);
        // Continue without context - intent analysis can still work
      }
    }

    // Analyze the edit intent
    const intent: EditIntent = analyzeEditIntent(prompt, context);

    logger.info('[analyze-edit-intent] Intent detected:', {
      type: intent.type,
      confidence: intent.confidence,
      confidenceLevel: intent.confidenceLevel,
      targetFiles: intent.targetFiles,
      keywords: intent.keywords,
    });

    // Format for display
    const formatted = formatIntentForDisplay(intent);
    const preview = getAffectedFilesPreview(intent);

    return json<AnalyzeEditIntentResponse>({
      success: true,
      intent: {
        type: intent.type,
        targetFiles: intent.targetFiles,
        confidence: intent.confidence,
        confidenceLevel: intent.confidenceLevel,
        description: intent.description,
        suggestedContext: intent.suggestedContext,
        keywords: intent.keywords,
        formatted,
        preview,
      },
    });
  } catch (error) {
    logger.error('[analyze-edit-intent] Error:', error);

    return json<AnalyzeEditIntentResponse>(
      {
        success: false,
        error: 'Failed to analyze edit intent',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analyze-edit-intent - Return available edit types (for documentation/debugging)
 */
export async function loader(): Promise<Response> {
  return json({
    description: 'Analyze Edit Intent API',
    availableTypes: Object.values(EditType),
    usage: {
      method: 'POST',
      body: {
        prompt: 'string (required) - The user prompt to analyze',
        projectId: 'string (optional) - Project ID to load context from',
        context: 'ProjectContext (optional) - Pre-loaded project context',
      },
      response: {
        success: 'boolean',
        intent: {
          type: 'EditType enum value',
          targetFiles: 'string[] - Files that will likely be modified',
          confidence: 'number (0-1) - Confidence score',
          confidenceLevel: 'high | medium | low',
          description: 'string - Human-readable description',
          suggestedContext: 'string[] - Additional files to include for context',
          keywords: 'string[] - Keywords that triggered this intent',
          formatted: 'string - Formatted display string',
          preview: {
            willModify: 'string[] - Files that will be modified',
            mayReference: 'string[] - Files that may be referenced',
            confidence: 'high | medium | low',
          },
        },
        error: 'string (optional) - Error message if failed',
      },
    },
    examples: [
      {
        prompt: 'Update the header component to be sticky',
        expectedType: 'UPDATE_COMPONENT',
      },
      {
        prompt: 'Add a new contact page',
        expectedType: 'ADD_FEATURE',
      },
      {
        prompt: 'Fix the bug in the login form',
        expectedType: 'FIX_ISSUE',
      },
      {
        prompt: 'Change the background color to dark blue',
        expectedType: 'UPDATE_STYLE',
      },
      {
        prompt: 'Install react-query',
        expectedType: 'ADD_DEPENDENCY',
      },
    ],
  });
}
