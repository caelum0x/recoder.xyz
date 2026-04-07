/**
 * Vercel Deployment Provider
 * Handles deployment to Vercel via their REST API
 */
import type { Deployment, DeploymentConfig, DeploymentProgress, ProviderCredentials, VercelProject } from './types';
export interface VercelUser {
    id: string;
    email: string;
    name: string;
    username: string;
}
export declare function validateToken(token: string): Promise<{
    valid: boolean;
    user?: VercelUser;
    error?: string;
}>;
export declare function getUser(token: string): Promise<VercelUser>;
export declare function listProjects(credentials: ProviderCredentials, options?: {
    limit?: number;
    search?: string;
}): Promise<VercelProject[]>;
export declare function getProject(credentials: ProviderCredentials, projectId: string): Promise<VercelProject>;
export declare function createProject(credentials: ProviderCredentials, config: {
    name: string;
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
    rootDirectory?: string;
    environmentVariables?: Array<{
        key: string;
        value: string;
        target?: ('production' | 'preview' | 'development')[];
    }>;
}): Promise<VercelProject>;
export declare function deleteProject(credentials: ProviderCredentials, projectId: string): Promise<void>;
export declare function deploy(credentials: ProviderCredentials, config: DeploymentConfig, files: Record<string, string>, onProgress?: (progress: DeploymentProgress) => void): Promise<Deployment>;
export declare function getDeployment(credentials: ProviderCredentials, deploymentId: string, projectId: string): Promise<Deployment>;
export declare function listDeployments(credentials: ProviderCredentials, options?: {
    projectId?: string;
    limit?: number;
    target?: 'production' | 'preview';
    state?: string;
}): Promise<Deployment[]>;
export declare function deleteDeployment(credentials: ProviderCredentials, deploymentId: string): Promise<void>;
export declare function cancelDeployment(credentials: ProviderCredentials, deploymentId: string): Promise<void>;
export interface VercelDomain {
    name: string;
    apexName: string;
    projectId: string;
    verified: boolean;
    createdAt: number;
}
export declare function listDomains(credentials: ProviderCredentials, projectId: string): Promise<VercelDomain[]>;
export declare function addDomain(credentials: ProviderCredentials, projectId: string, domain: string): Promise<VercelDomain>;
export declare function removeDomain(credentials: ProviderCredentials, projectId: string, domain: string): Promise<void>;
export interface VercelEnvVar {
    id: string;
    key: string;
    value: string;
    type: 'plain' | 'encrypted' | 'secret';
    target: ('production' | 'preview' | 'development')[];
    createdAt: number;
    updatedAt: number;
}
export declare function listEnvVars(credentials: ProviderCredentials, projectId: string): Promise<VercelEnvVar[]>;
export declare function setEnvVar(credentials: ProviderCredentials, projectId: string, envVar: {
    key: string;
    value: string;
    type?: 'plain' | 'encrypted' | 'secret';
    target?: ('production' | 'preview' | 'development')[];
}): Promise<VercelEnvVar>;
export declare function deleteEnvVar(credentials: ProviderCredentials, projectId: string, envVarId: string): Promise<void>;
export declare function getBuildLogs(credentials: ProviderCredentials, deploymentId: string): Promise<string[]>;
export declare function rollback(credentials: ProviderCredentials, projectId: string, deploymentId: string): Promise<Deployment>;
