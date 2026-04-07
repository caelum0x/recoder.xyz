/**
 * Secrets Manager Service
 * Handles encrypted environment variable management
 */
export interface Secret {
    key: string;
    value: string;
    masked: boolean;
    environment: 'development' | 'production' | 'test' | 'local';
}
export declare function getSecrets(containerId: string, environment: string): Promise<Secret[]>;
export declare function setSecret(containerId: string, key: string, value: string, environment: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function deleteSecret(containerId: string, key: string, environment: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function exportSecretsToEnv(containerId: string, environment: string): Promise<string[]>;
export declare const secretsManager: {
    getSecrets: typeof getSecrets;
    setSecret: typeof setSecret;
    deleteSecret: typeof deleteSecret;
    exportSecretsToEnv: typeof exportSecretsToEnv;
};
