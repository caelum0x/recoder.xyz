/**
 * AI Theme Generation
 * Generates design system themes from screenshots using vision-capable AI models.
 * Supports Anthropic, OpenAI, Google, and OpenRouter providers.
 */
export type GenerationMode = 'inspired' | 'high-fidelity';
export type Provider = 'anthropic' | 'openai' | 'google' | 'openrouter';
export interface GenerateThemeParams {
    images: string[];
    keywords: string;
    generationMode: GenerationMode;
    model: string;
    apiKey: string;
    provider: Provider;
}
export declare function generateThemePrompt(params: GenerateThemeParams): Promise<string>;
