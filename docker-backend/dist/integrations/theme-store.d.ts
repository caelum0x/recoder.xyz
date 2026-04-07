/**
 * Theme Store — CRUD for custom themes and per-project theme assignments.
 * Uses JSON file persistence via loadStore/saveStore.
 */
import { type BuiltinTheme } from './builtin-themes.js';
export interface CustomTheme {
    id: string;
    name: string;
    description: string;
    prompt: string;
    createdAt: number;
    updatedAt: number;
    createdBy: string;
}
export declare function listThemes(userId: string): CustomTheme[];
export declare function listAllThemes(): CustomTheme[];
export declare function createTheme(userId: string, name: string, description: string, prompt: string): CustomTheme;
export declare function updateTheme(themeId: string, updates: Partial<Pick<CustomTheme, 'name' | 'description' | 'prompt'>>): CustomTheme | null;
export declare function deleteTheme(themeId: string): boolean;
export declare function getProjectTheme(projectId: string): string | null;
export declare function setProjectTheme(projectId: string, themeId: string): void;
export declare function removeProjectTheme(projectId: string): void;
export declare function getBuiltinTheme(themeId: string): BuiltinTheme | null;
/**
 * Resolve a theme ID to its prompt text.
 * Checks built-ins first, then custom themes for the given user.
 */
export declare function resolveThemePrompt(themeId: string, userId: string): string | null;
