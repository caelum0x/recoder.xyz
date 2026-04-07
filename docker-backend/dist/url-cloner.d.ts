/**
 * URL Cloner - Create exact clones of websites
 * Downloads HTML, CSS, images, fonts, and all assets to create a pixel-perfect replica
 * Runs in docker-backend for full Node.js capabilities
 */
export interface ClonedAsset {
    originalUrl: string;
    localPath: string;
    content: string;
    contentType: string;
}
export interface ClonedWebsite {
    url: string;
    title: string;
    html: string;
    files: Record<string, string>;
    assetCount: number;
}
/**
 * Fetch and clone an entire website
 */
export declare function cloneWebsite(url: string): Promise<ClonedWebsite>;
