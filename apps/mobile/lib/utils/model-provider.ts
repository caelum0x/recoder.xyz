/**
 * Model Provider Utilities
 *
 * Utilities for determining model providers from model IDs
 */

import AnthropicIcon from '@/assets/images/models/Anthropic.svg';
import OAIIcon from '@/assets/images/models/OAI.svg';
import GeminiIcon from '@/assets/images/models/Gemini.svg';
import GrokIcon from '@/assets/images/models/Grok.svg';
import MoonshotIcon from '@/assets/images/models/Moonshot.svg';
import { Image } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import React from 'react';

const RecoderSymbolRasterIcon: React.FC<SvgProps> = ({ width = 16, height = 16 }) => {
  const normalizeSize = (value: string | number | undefined, fallback: number): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  };

  return React.createElement(Image, {
    source: require('@/assets/brand/raster/recoder-symbol.png'),
    style: {
      width: normalizeSize(width, 16),
      height: normalizeSize(height, 16),
    },
    resizeMode: 'contain',
  });
};

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'moonshotai'
  | 'bedrock'
  | 'openrouter'
  | 'recoder';

/**
 * Check if a model ID corresponds to a Recoder mode (Basic or Advanced)
 */
export function isRecoderMode(modelId: string): boolean {
  // New Recoder registry IDs
  if (modelId === 'recoder/basic' || modelId === 'recoder/power' ||
      modelId === 'recoder-basic' || modelId === 'recoder-power') {
    return true;
  }
  // Legacy: Recoder Basic (Haiku 4.5)
  if (modelId.includes('claude-haiku-4-5') || modelId.includes('heol2zyy5v48')) {
    return true;
  }
  // Legacy: Recoder Advanced Mode (Sonnet 4.5)
  if (modelId.includes('claude-sonnet-4-5') || modelId.includes('few7z4l830xh')) {
    return true;
  }
  return false;
}

/**
 * Get the provider from a model ID
 */
export function getModelProvider(modelId: string): ModelProvider {
  // Check for Recoder modes first
  if (isRecoderMode(modelId)) {
    return 'recoder';
  }
  if (modelId.includes('anthropic') || modelId.includes('claude')) {
    return 'anthropic';
  }
  if (modelId.includes('openai') || modelId.includes('gpt')) {
    return 'openai';
  }
  if (modelId.includes('google') || modelId.includes('gemini')) {
    return 'google';
  }
  if (modelId.includes('xai') || modelId.includes('grok')) {
    return 'xai';
  }
  if (modelId.includes('moonshotai') || modelId.includes('kimi')) {
    return 'moonshotai';
  }
  if (modelId.includes('bedrock')) {
    return 'bedrock';
  }
  if (modelId.includes('openrouter')) {
    return 'openrouter';
  }

  // Default fallback - try to extract provider from model ID format "provider/model"
  const parts = modelId.split('/');
  if (parts.length > 1) {
    const provider = parts[0].toLowerCase();
    if (['openai', 'anthropic', 'google', 'xai', 'moonshotai', 'bedrock', 'openrouter', 'recoder'].includes(provider)) {
      return provider as ModelProvider;
    }
  }

  return 'openai'; // Default fallback
}

/**
 * Get the provider display name
 */
export function getModelProviderName(modelId: string): string {
  const provider = getModelProvider(modelId);

  const nameMap: Record<ModelProvider, string> = {
    recoder: 'Recoder',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    xai: 'xAI',
    moonshotai: 'Moonshot AI',
    bedrock: 'AWS Bedrock',
    openrouter: 'OpenRouter',
  };

  return nameMap[provider] || 'Unknown';
}

/**
 * Get the icon component for a model provider
 */
export function getModelProviderIcon(modelId: string): React.FC<SvgProps> {
  const provider = getModelProvider(modelId);

  const iconMap: Record<ModelProvider, React.FC<SvgProps>> = {
    recoder: RecoderSymbolRasterIcon,
    anthropic: AnthropicIcon,
    openai: OAIIcon,
    google: GeminiIcon,
    xai: GrokIcon,
    moonshotai: MoonshotIcon,
    bedrock: AnthropicIcon, // Bedrock uses Anthropic models primarily
    openrouter: OAIIcon, // Default to OpenAI icon for OpenRouter
  };

  return iconMap[provider] || OAIIcon;
}
