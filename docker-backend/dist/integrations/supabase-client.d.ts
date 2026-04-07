/**
 * Supabase Management API Client
 * Wraps the Supabase Management API (https://api.supabase.com/v1/)
 * for organizations, projects, branches, SQL, edge functions, etc.
 */
export interface SupabaseOrganization {
    id: string;
    name: string;
    slug: string;
}
export interface SupabaseProject {
    id: string;
    name: string;
    region: string;
    organization_id: string;
    status: string;
}
export interface SupabaseBranch {
    id: string;
    name: string;
    is_default: boolean;
    project_ref: string;
    parent_project_ref?: string;
}
export interface SupabaseApiKey {
    name: string;
    api_key: string;
}
export interface SupabaseLogEntry {
    id: string;
    timestamp: number;
    event_message: string;
    metadata?: Record<string, unknown>;
}
export interface SupabaseDeployResult {
    id: string;
    slug: string;
    name: string;
    status: string;
    version: number;
    created_at: string;
    updated_at: string;
}
export declare function listOrganizations(accessToken: string): Promise<SupabaseOrganization[]>;
export declare function listProjects(accessToken: string): Promise<SupabaseProject[]>;
export declare function listBranches(accessToken: string, projectId: string): Promise<SupabaseBranch[]>;
export declare function getProjectApiKeys(accessToken: string, projectId: string): Promise<SupabaseApiKey[]>;
export declare function executeSql(accessToken: string, projectId: string, query: string): Promise<unknown>;
export declare function getTableSchema(accessToken: string, projectId: string): Promise<string>;
export declare function getEdgeFunctionLogs(accessToken: string, projectId: string, since?: number): Promise<SupabaseLogEntry[]>;
export declare function deployEdgeFunction(accessToken: string, projectId: string, functionName: string, fileContents: Uint8Array): Promise<SupabaseDeployResult>;
/**
 * Validate that a Supabase access token is valid by listing organizations.
 */
export declare function validateAccessToken(accessToken: string): Promise<boolean>;
