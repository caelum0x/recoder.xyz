/**
 * Prompt Library Store
 * CRUD for reusable custom prompts. Users can reference prompts via @prompt:id in chat.
 * Uses JSON file persistence via loadStore/saveStore.
 */
export interface Prompt {
    id: string;
    title: string;
    description: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    createdBy: string;
}
export declare function listPrompts(userId: string): Prompt[];
export declare function getPrompt(promptId: string): Prompt | null;
export declare function createPrompt(userId: string, title: string, description: string, content: string): Prompt;
export declare function updatePrompt(promptId: string, updates: Partial<Pick<Prompt, 'title' | 'description' | 'content'>>): Prompt | null;
export declare function deletePrompt(promptId: string): boolean;
/**
 * Replace @prompt:id references in a string with actual prompt content.
 * Used in the chat pipeline before sending to AI.
 */
export declare function replacePromptReferences(text: string): string;
/**
 * Get multiple prompts by IDs (for batch lookups).
 */
export declare function getPromptsByIds(ids: string[]): Record<string, Prompt>;
