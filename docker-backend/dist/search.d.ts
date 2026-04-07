/**
 * Search Service - Uses ripgrep for fast file search
 */
export interface SearchResult {
    file: string;
    line: number;
    column: number;
    text: string;
    matchStart: number;
    matchEnd: number;
}
export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    include?: string;
    exclude?: string;
    maxResults?: number;
}
export declare class SearchService {
    /**
     * Search in files using ripgrep
     */
    search(containerId: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Replace in files
     */
    replace(containerId: string, searchQuery: string, replaceText: string, files: string[]): Promise<{
        success: boolean;
        filesModified: number;
    }>;
    /**
     * Parse ripgrep JSON output
     */
    private parseRipgrepOutput;
    private execCommand;
}
export declare const searchService: SearchService;
