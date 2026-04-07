/**
 * Vercel Integration Store
 * Manages Vercel access tokens, project linking, and deployment history.
 * Uses JSON file persistence via loadStore/saveStore.
 */
export interface VercelDeployment {
    uid: string;
    url: string;
    state: string;
    createdAt: number;
    target: string | null;
    readyState: string;
}
export interface VercelProjectLink {
    vercelProjectId: string;
    vercelProjectName: string;
    vercelTeamId: string | null;
    vercelDeploymentUrl: string | null;
}
export interface VercelProject {
    id: string;
    name: string;
    framework: string | null;
}
export declare function getVercelToken(userId: string): string | null;
export declare function setVercelToken(userId: string, token: string): void;
export declare function removeVercelToken(userId: string): void;
export declare function getVercelProjectLink(projectId: string): VercelProjectLink | null;
export declare function setVercelProjectLink(projectId: string, link: VercelProjectLink): void;
export declare function removeVercelProjectLink(projectId: string): void;
export declare function validateVercelToken(token: string): Promise<{
    valid: boolean;
    username?: string;
}>;
export declare function listVercelTeams(token: string): Promise<Array<{
    id: string;
    slug: string;
    name: string;
}>>;
export declare function listVercelProjects(token: string, teamId?: string | null): Promise<VercelProject[]>;
export declare function getVercelDeployments(token: string, projectId: string, teamId?: string | null): Promise<VercelDeployment[]>;
export declare function isProjectNameAvailable(token: string, name: string, teamId?: string | null): Promise<boolean>;
export declare function createVercelProject(token: string, name: string, framework?: string, teamId?: string | null): Promise<VercelProject>;
export declare function connectToExistingProject(token: string, vercelProjectId: string, teamId?: string | null): Promise<{
    id: string;
    name: string;
    framework: string | null;
}>;
/**
 * Detect framework from common config files present in the project.
 */
export declare function detectFramework(fileList: string[]): string | null;
