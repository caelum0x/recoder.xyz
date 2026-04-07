/**
 * Built-in Design System Themes
 * Each theme provides a <theme></theme> wrapped system prompt that instructs the AI
 * on color systems, typography, component guidelines, motion, and layout.
 */
export interface BuiltinTheme {
    id: string;
    name: string;
    description: string;
    prompt: string;
}
export declare const BUILTIN_THEMES: BuiltinTheme[];
