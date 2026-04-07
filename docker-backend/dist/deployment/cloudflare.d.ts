/**
 * Cloudflare Workers Deployment Provider
 * Handles deployment to Cloudflare Workers via their REST API
 */
import type { Deployment, DeploymentConfig, DeploymentProgress, ProviderCredentials } from './types';
export interface CloudflareAccount {
    id: string;
    name: string;
    type: string;
    created_on: string;
    settings: Record<string, unknown>;
}
export declare function validateToken(apiToken: string, accountId: string): Promise<{
    valid: boolean;
    account?: {
        name: string;
        id: string;
    };
    error?: string;
}>;
export declare function verifyToken(apiToken: string): Promise<{
    valid: boolean;
    error?: string;
}>;
export interface CloudflareWorker {
    id: string;
    name: string;
    created_on: string;
    modified_on: string;
    etag?: string;
    usage_model?: string;
    compatibility_date?: string;
    compatibility_flags?: string[];
}
export declare function listWorkers(credentials: ProviderCredentials): Promise<CloudflareWorker[]>;
export declare function getWorker(credentials: ProviderCredentials, workerName: string): Promise<CloudflareWorker>;
export declare function deleteWorker(credentials: ProviderCredentials, workerName: string): Promise<void>;
export declare function deploy(credentials: ProviderCredentials, config: DeploymentConfig, files: Record<string, string>, onProgress?: (progress: DeploymentProgress) => void): Promise<Deployment>;
export declare function listSecrets(credentials: ProviderCredentials, workerName: string): Promise<Array<{
    name: string;
    type: string;
}>>;
export declare function deleteSecret(credentials: ProviderCredentials, workerName: string, secretName: string): Promise<void>;
export interface CloudflareDomain {
    id: string;
    zone_id: string;
    zone_name: string;
    hostname: string;
    service: string;
    environment: string;
    created_on: string;
    modified_on: string;
}
export declare function listDomains(credentials: ProviderCredentials, workerName: string): Promise<CloudflareDomain[]>;
export declare function addCustomDomain(credentials: ProviderCredentials, workerName: string, hostname: string, zoneId: string): Promise<CloudflareDomain>;
export declare function listDeployments(credentials: ProviderCredentials, workerName: string): Promise<Deployment[]>;
export declare function getDeployment(credentials: ProviderCredentials, workerName: string, deploymentId: string, projectId: string): Promise<Deployment>;
export declare function rollback(credentials: ProviderCredentials, workerName: string, versionId: string, projectId: string): Promise<Deployment>;
export declare function getTailUrl(credentials: ProviderCredentials, workerName: string): Promise<{
    url: string;
    expires_at: string;
}>;
export interface WorkerRoute {
    id: string;
    pattern: string;
    script: string;
}
export declare function listRoutes(credentials: ProviderCredentials, zoneId: string): Promise<WorkerRoute[]>;
export declare function createRoute(credentials: ProviderCredentials, zoneId: string, pattern: string, workerName: string): Promise<WorkerRoute>;
export declare function deleteRoute(credentials: ProviderCredentials, zoneId: string, routeId: string): Promise<void>;
