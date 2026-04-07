/**
 * Style Utilities for Visual Editing
 * Converts CSS style objects to Tailwind CSS classes.
 * Ported from Dyad's style-utils.ts pattern.
 */
export interface ComponentStyles {
    margin?: {
        top: string;
        right: string;
        bottom: string;
        left: string;
    };
    padding?: {
        top: string;
        right: string;
        bottom: string;
        left: string;
    };
    border?: {
        width: string;
        radius: string;
        color: string;
        style: string;
    };
    backgroundColor?: string;
    text?: {
        fontSize: string;
        fontWeight: string;
        fontFamily: string;
        color: string;
        lineHeight: string;
    };
}
/**
 * Convert a ComponentStyles object to an array of Tailwind class strings
 */
export declare function stylesToTailwind(styles: ComponentStyles): string[];
/**
 * Extract the set of class prefixes that correspond to the given style changes.
 * These prefixes identify which existing Tailwind classes should be removed
 * before adding the new ones.
 */
export declare function extractClassPrefixes(styles: ComponentStyles): string[];
/**
 * Filter out existing classes that match any of the given prefixes
 */
export declare function filterExistingClasses(existingClasses: string[], prefixesToRemove: string[]): string[];
