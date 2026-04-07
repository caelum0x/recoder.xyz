/**
 * Multi-Language Server Manager
 * Supports TypeScript, JavaScript, Python, Go, Rust, etc.
 * Uses same LSP servers as VSCode
 */
import { EventEmitter } from 'events';
export interface Diagnostic {
    file: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    code?: string | number;
    source: string;
    fixes?: CodeFix[];
}
export interface CodeFix {
    title: string;
    kind: 'quickfix' | 'refactor';
    edits: TextEdit[];
}
export interface TextEdit {
    file: string;
    range: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
    newText: string;
}
export declare class LanguageServerManager extends EventEmitter {
    private servers;
    /**
     * Auto-detect and start language servers based on project files
     */
    autoStart(containerId: string, projectId: string): Promise<void>;
    /**
     * Start specific language server
     */
    private startLanguageServer;
    /**
     * Get diagnostics for all languages
     */
    getAllDiagnostics(containerId: string, projectId: string): Promise<Diagnostic[]>;
    /**
     * Get diagnostics for specific language
     */
    private getDiagnosticsForLanguage;
    private getTypeScriptDiagnostics;
    private getPythonDiagnostics;
    private getRustDiagnostics;
    private getGoDiagnostics;
    private parseTscOutput;
    private startDiagnosticPolling;
    stop(projectId: string): Promise<void>;
    /**
     * Get code fixes for a diagnostic
     */
    getCodeFixes(containerId: string, diagnostic: Diagnostic): Promise<CodeFix[]>;
    /**
     * Get TypeScript quick fixes
     */
    private getTypeScriptFixes;
    /**
     * Apply code fix
     */
    applyCodeFix(containerId: string, fix: CodeFix): Promise<boolean>;
    private execCommand;
    /**
     * Get hover info at position
     */
    getHover(containerId: string, file: string, line: number, character: number): Promise<{
        contents: string;
    } | null>;
    /**
     * Get definition location
     */
    getDefinition(containerId: string, file: string, line: number, character: number): Promise<{
        uri: string;
        range: {
            start: {
                line: number;
                character: number;
            };
        };
    } | null>;
}
export declare const languageServerManager: LanguageServerManager;
