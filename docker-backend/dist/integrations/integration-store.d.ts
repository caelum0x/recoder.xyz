/**
 * Integration Credentials & Project Links Store
 * Manages per-user credentials (Supabase, Neon) and per-project integration links.
 * Uses JSON file persistence via loadStore/saveStore.
 */
export interface IntegrationCredentials {
    supabase?: {
        accessToken: string;
    };
    neon?: {
        apiKey: string;
    };
}
export interface ProjectSupabaseLink {
    projectId: string;
    organizationSlug: string;
    parentProjectId?: string;
}
export interface ProjectNeonLink {
    projectId: string;
    developmentBranchId: string;
    previewBranchId?: string;
}
export interface ProjectIntegrationLinks {
    supabase?: ProjectSupabaseLink;
    neon?: ProjectNeonLink;
}
export declare function getUserCredentials(userId: string): IntegrationCredentials;
export declare function setUserCredentials(userId: string, provider: 'supabase' | 'neon', creds: {
    accessToken?: string;
    apiKey?: string;
}): void;
export declare function removeUserCredentials(userId: string, provider: 'supabase' | 'neon'): void;
export declare function getProjectLinks(projectId: string): ProjectIntegrationLinks;
export declare function setProjectLink(projectId: string, provider: 'supabase' | 'neon', link: ProjectSupabaseLink | ProjectNeonLink): void;
export declare function removeProjectLink(projectId: string, provider: 'supabase' | 'neon'): void;
