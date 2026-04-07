/**
 * Netlify Deployment Provider
 * Handles deployment to Netlify via their REST API
 */
import type { Deployment, DeploymentConfig, DeploymentProgress, ProviderCredentials, NetlifySite } from './types';
export interface NetlifyUser {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string;
    created_at: string;
}
export declare function validateToken(token: string): Promise<{
    valid: boolean;
    user?: NetlifyUser;
    error?: string;
}>;
export declare function getUser(token: string): Promise<NetlifyUser>;
export declare function listSites(credentials: ProviderCredentials, options?: {
    filter?: string;
}): Promise<NetlifySite[]>;
export declare function getSite(credentials: ProviderCredentials, siteId: string): Promise<NetlifySite>;
export declare function createSite(credentials: ProviderCredentials, config: {
    name?: string;
    customDomain?: string;
    password?: string;
}): Promise<NetlifySite>;
export declare function deleteSite(credentials: ProviderCredentials, siteId: string): Promise<void>;
export declare function updateSite(credentials: ProviderCredentials, siteId: string, updates: {
    name?: string;
    customDomain?: string;
    buildSettings?: {
        cmd?: string;
        dir?: string;
        env?: Record<string, string>;
    };
}): Promise<NetlifySite>;
export declare function deploy(credentials: ProviderCredentials, config: DeploymentConfig, files: Record<string, string>, onProgress?: (progress: DeploymentProgress) => void): Promise<Deployment>;
export declare function getDeployment(credentials: ProviderCredentials, siteId: string, deployId: string, projectId: string): Promise<Deployment>;
export declare function listDeployments(credentials: ProviderCredentials, siteId: string, options?: {
    limit?: number;
    page?: number;
}): Promise<Deployment[]>;
export declare function deleteDeployment(credentials: ProviderCredentials, deployId: string): Promise<void>;
export declare function cancelDeployment(credentials: ProviderCredentials, deployId: string): Promise<void>;
export interface NetlifyEnvVar {
    key: string;
    scopes: string[];
    values: Array<{
        id: string;
        value: string;
        context: string;
    }>;
}
export declare function listEnvVars(credentials: ProviderCredentials, siteId: string): Promise<NetlifyEnvVar[]>;
export declare function setEnvVar(credentials: ProviderCredentials, siteId: string, key: string, value: string, context?: string): Promise<NetlifyEnvVar>;
export declare function createEnvVar(credentials: ProviderCredentials, siteId: string, key: string, value: string): Promise<NetlifyEnvVar[]>;
export declare function deleteEnvVar(credentials: ProviderCredentials, siteId: string, key: string): Promise<void>;
export interface NetlifyDomain {
    id: string;
    hostname: string;
    ssl: boolean;
    url: string;
    state: string;
    custom_primary: boolean;
}
export declare function listDomains(credentials: ProviderCredentials, siteId: string): Promise<NetlifyDomain[]>;
export declare function addDomain(credentials: ProviderCredentials, siteId: string, domain: string): Promise<void>;
export declare function rollback(credentials: ProviderCredentials, siteId: string, deployId: string, projectId: string): Promise<Deployment>;
export interface NetlifyBuildHook {
    id: string;
    title: string;
    branch: string;
    url: string;
    created_at: string;
}
export declare function listBuildHooks(credentials: ProviderCredentials, siteId: string): Promise<NetlifyBuildHook[]>;
export declare function createBuildHook(credentials: ProviderCredentials, siteId: string, title: string, branch?: string): Promise<NetlifyBuildHook>;
export declare function deleteBuildHook(credentials: ProviderCredentials, siteId: string, hookId: string): Promise<void>;
export declare function triggerBuildHook(hookUrl: string): Promise<void>;
