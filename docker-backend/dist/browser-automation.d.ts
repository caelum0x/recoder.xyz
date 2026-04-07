/**
 * Browser Automation Service for docker-backend
 * Real Puppeteer implementation running inside Docker containers
 * Note: puppeteer is lazily imported so the server can start without it installed.
 */
export interface BrowserActionResult {
    success: boolean;
    screenshot?: string;
    logs?: string[];
    currentUrl?: string;
    extractedContent?: string;
    error?: string;
}
export interface BrowserSessionConfig {
    headless?: boolean;
    timeout?: number;
    viewport?: {
        width: number;
        height: number;
    };
}
/**
 * Launch a browser session and navigate to URL
 */
export declare function browserLaunch(projectId: string, url: string, config?: BrowserSessionConfig): Promise<BrowserActionResult>;
/**
 * Click an element by selector
 */
export declare function browserClick(projectId: string, selector: string): Promise<BrowserActionResult>;
/**
 * Type text into an element
 */
export declare function browserType(projectId: string, selector: string, text: string): Promise<BrowserActionResult>;
/**
 * Take a screenshot of the current page
 */
export declare function browserScreenshot(projectId: string): Promise<BrowserActionResult>;
/**
 * Extract text content from elements matching selector
 */
export declare function browserExtract(projectId: string, selector: string): Promise<BrowserActionResult>;
/**
 * Execute JavaScript in the page context
 */
export declare function browserExecute(projectId: string, script: string): Promise<BrowserActionResult>;
/**
 * Scroll the page
 */
export declare function browserScroll(projectId: string, direction: 'up' | 'down'): Promise<BrowserActionResult>;
/**
 * Navigate to a new URL
 */
export declare function browserNavigate(projectId: string, url: string): Promise<BrowserActionResult>;
/**
 * Close the browser session
 */
export declare function browserClose(projectId: string): Promise<BrowserActionResult>;
/**
 * Check if a session exists
 */
export declare function hasSession(projectId: string): boolean;
/**
 * Get all active session IDs
 */
export declare function getActiveSessions(): string[];
