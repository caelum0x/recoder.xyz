/**
 * Preview Proxy - Routes preview URLs to container dev servers
 */
import type { Express } from 'express';
export declare function setupPreviewProxy(app: Express, containers: Map<string, {
    id: string;
    lastActive: number;
    port: number;
}>): void;
