/**
 * Neon PostgreSQL Management Client
 * Uses the Neon API (https://console.neon.tech/api/v2) for project, branch,
 * and connection management.
 */
export interface NeonProject {
    id: string;
    name: string;
    region_id: string;
    org_id?: string;
    created_at?: string;
}
export interface NeonBranch {
    id: string;
    name: string;
    project_id: string;
    parent_id?: string;
    created_at: string;
    default: boolean;
}
export interface NeonProjectCreated {
    project: NeonProject;
    connectionUri: string;
    developmentBranchId: string;
    previewBranchId: string;
}
export interface NeonOrg {
    id: string;
    name: string;
}
export interface NeonEndpoint {
    id: string;
    host: string;
    branch_id: string;
    type: string;
}
export declare function listProjects(apiKey: string): Promise<NeonProject[]>;
export declare function createProject(apiKey: string, name: string, orgId?: string): Promise<NeonProjectCreated>;
export declare function getProject(apiKey: string, projectId: string): Promise<NeonProject>;
export declare function listBranches(apiKey: string, projectId: string): Promise<NeonBranch[]>;
export declare function createBranch(apiKey: string, projectId: string, name: string, parentId: string): Promise<NeonBranch>;
export declare function deleteBranch(apiKey: string, projectId: string, branchId: string): Promise<void>;
export declare function restoreBranch(apiKey: string, projectId: string, branchId: string, timestamp: string): Promise<void>;
export declare function getConnectionUri(apiKey: string, projectId: string, branchId: string): Promise<string>;
export declare function getOrganizations(apiKey: string): Promise<NeonOrg[]>;
export declare function validateApiKey(apiKey: string): Promise<boolean>;
