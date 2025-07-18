/**
 * CodeCraft Shared Utilities
 * Common types, utilities, and constants shared across all packages
 */
export interface ProjectPlan {
    name: string;
    description: string;
    architecture: string;
    features: string[];
    integrations: string[];
    dependencies: Record<string, string>;
}
export interface CodeGenerationOptions {
    outputDir: string;
    template: string;
    variables: Record<string, any>;
    skipExisting: boolean;
}
export declare class Logger {
    static info(message: string): void;
    static error(message: string): void;
    static warn(message: string): void;
}
export declare const VERSION = "1.0.0";
//# sourceMappingURL=index.d.ts.map