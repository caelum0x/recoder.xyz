/**
 * Starter Prompt Enhancer
 * Analyzes user prompts and automatically suggests/loads appropriate starters
 */

interface StarterMatch {
  starterId: string;
  confidence: number;
  reason: string;
}

// Comprehensive keyword mapping for starter detection
const STARTER_KEYWORDS = {
  'angular': {
    keywords: ['angular', 'ng', 'angular app', 'angular project'],
    starterId: 'angular',
    confidence: 0.9,
  },
  'react-native': {
    keywords: ['react native', 'mobile app', 'expo', 'ios app', 'android app', 'mobile application'],
    starterId: 'bolt-expo',
    confidence: 0.85,
  },
  'blog': {
    keywords: ['blog', 'blogging', 'blog app', 'blog site', 'blog platform'],
    starterId: 'nextjs-blog-mdx',
    confidence: 0.85,
  },
  'blog-simple': {
    keywords: ['simple blog', 'basic blog', 'react native blog'],
    starterId: 'BlogApp',
    confidence: 0.8,
  },
  'astro': {
    keywords: ['astro', 'static site', 'astro project', 'astro app'],
    starterId: 'astro-shadcn',
    confidence: 0.9,
  },
  'qwik': {
    keywords: ['qwik', 'qwik app', 'qwik project', 'resumable'],
    starterId: 'bolt-qwik',
    confidence: 0.9,
  },
  'vite-react': {
    keywords: ['vite', 'vite react', 'fast react', 'react vite', 'modern react'],
    starterId: 'bolt-vite-react-ts',
    confidence: 0.85,
  },
  'express-backend': {
    keywords: ['express', 'backend', 'api server', 'rest api', 'node server', 'authentication'],
    starterId: 'express-typescript-auth',
    confidence: 0.8,
  },
  'e-commerce': {
    keywords: ['e-commerce', 'ecommerce', 'shop', 'store', 'shopping', 'marketplace', 'cart', 'online store', 'stripe'],
    starterId: 'nextjs-ecommerce-stripe',
    confidence: 0.85,
  },
  'dashboard': {
    keywords: ['dashboard', 'admin', 'admin panel', 'analytics', 'charts', 'metrics'],
    starterId: 'nextjs-dashboard',
    confidence: 0.8,
  },
};

/**
 * Detect which starter best matches the user's request
 */
export function detectStarter(userMessage: string): StarterMatch | null {
  const messageLower = userMessage.toLowerCase();
  let bestMatch: StarterMatch | null = null;
  let highestConfidence = 0.6; // Minimum confidence threshold

  for (const [category, config] of Object.entries(STARTER_KEYWORDS)) {
    for (const keyword of config.keywords) {
      if (messageLower.includes(keyword)) {
        const confidence = config.confidence;

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = {
            starterId: config.starterId,
            confidence,
            reason: `Detected "${keyword}" indicating ${category} project`,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Generate enhanced system prompt with starter context
 */
export function generateStarterEnhancedPrompt(
  userMessage: string,
  starterMatch: StarterMatch
): string {
  return `The user wants to ${userMessage}

IMPORTANT: I've detected this matches our "${starterMatch.starterId}" starter template.

INSTRUCTIONS:
1. Use the starter template files as your base
2. The starter already includes proper project structure and dependencies
3. Modify the starter to match user's specific requirements
4. Don't create from scratch - build on the existing starter
5. Maintain the starter's architecture and best practices

Confidence: ${(starterMatch.confidence * 100).toFixed(0)}%
Reason: ${starterMatch.reason}`;
}

/**
 * Create system message for AI to use starter
 */
export function createStarterSystemMessage(starterId: string, files: Record<string, string>): string {
  const fileList = Object.keys(files).slice(0, 10).join(', ');
  const moreFiles = Object.keys(files).length > 10 ? ` and ${Object.keys(files).length - 10} more` : '';

  return `You are now working with the "${starterId}" starter template.

AVAILABLE STARTER FILES:
${fileList}${moreFiles}

Total files: ${Object.keys(files).length}

IMPORTANT RULES:
1. ✅ USE these starter files as your foundation
2. ✅ MODIFY the starter to match user requirements
3. ✅ KEEP the starter's architecture and structure
4. ✅ ADD new features on top of the starter
5. ❌ DON'T create a new project from scratch
6. ❌ DON'T ignore the starter files

The starter is already set up with:
- Project structure
- Dependencies configured
- Build system ready
- Best practices implemented

BUILD ON THIS FOUNDATION to save time and ensure quality!`;
}

/**
 * Enhanced prompt for chat that includes starter suggestions
 */
export function enhancePromptWithStarter(userMessage: string): {
  enhancedMessage: string;
  detectedStarter: StarterMatch | null;
  shouldLoadStarter: boolean;
} {
  const detected = detectStarter(userMessage);

  if (!detected) {
    return {
      enhancedMessage: userMessage,
      detectedStarter: null,
      shouldLoadStarter: false,
    };
  }

  const shouldLoad = detected.confidence > 0.7;

  const enhancedMessage = shouldLoad
    ? `${userMessage}\n\n[AUTO-DETECTED: This matches our ${detected.starterId} starter. Loading template...]`
    : userMessage;

  return {
    enhancedMessage,
    detectedStarter: detected,
    shouldLoadStarter: shouldLoad,
  };
}
