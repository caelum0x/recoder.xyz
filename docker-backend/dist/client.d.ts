/**
 * Docker Backend Client SDK
 * Use this in recoder-web to connect to Docker backend
 */
export interface DockerClientConfig {
    baseUrl: string;
}
export declare class DockerClient {
    private baseUrl;
    private projectId;
    private containerId;
    private terminalWs;
    private syncWs;
    constructor(config: DockerClientConfig, projectId: string);
    init(): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    listFiles(path?: string): Promise<string[]>;
    exec(command: string, cwd?: string): Promise<string>;
    connectTerminal(onData: (data: string) => void): {
        write: (data: string) => void;
        close: () => void;
    };
    connectSync(onEvent: (event: Record<string, unknown>) => void): {
        write: (path: string, content: string) => void;
        read: (path: string) => void;
        list: (path?: string) => void;
        delete: (path: string) => void;
        close: () => void;
    };
    destroy(): Promise<void>;
}
export declare function createDockerClient(baseUrl: string, projectId: string): DockerClient;
