import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesTotal?: number; // Total messages allowed (for guests)
  maxMessagesPerDay?: number; // Daily limit (for regular users)
  availableChatModelIds: Array<ChatModel['id']>;
  canAccessPremiumFeatures?: boolean;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * FREEMIUM STRATEGY: Guest users get LIMITED messages to test
   * Since OpenRouter models are FREE, we use message limits to drive sign-ups
   */
  guest: {
    maxMessagesTotal: 20, // 20 messages to properly test - still forces sign up!
    availableChatModelIds: [
      // All Free AI Models for guests too!
      'deepseek/deepseek-r1:free',
      'glm-4.5-air',
      'qwen/qwen3-coder-480b-a35b:free',
      'deepseek/deepseek-v3-0324:free',
      'microsoft/mai-ds-r1:free',
      'unified-fast',
    ],
    canAccessPremiumFeatures: false,
  },

  /*
   * FREE TIER: Users with OAuth account get UNLIMITED free model usage
   * No API costs since OpenRouter models are free!
   * Premium upsell is for advanced features, not message limits
   */
  regular: {
    maxMessagesPerDay: undefined, // UNLIMITED messages with free models!
    availableChatModelIds: [
      // All Free AI Models
      'deepseek/deepseek-r1:free',
      'glm-4.5-air',
      'qwen/qwen3-coder-480b-a35b:free',
      'deepseek/deepseek-v3-0324:free',
      'microsoft/mai-ds-r1:free',
      // Unified models
      'unified-balanced',
      'unified-fast',
    ],
    canAccessPremiumFeatures: false,
  },

  /*
   * PREMIUM TIER: Paid users get advanced features
   * - Unlimited messages
   * - Premium AI models (Claude, GPT-4, Gemini Pro)
   * - Image generation
   * - Priority support
   * - Advanced code execution
   */
};
