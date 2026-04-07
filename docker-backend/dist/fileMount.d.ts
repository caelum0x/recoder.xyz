export interface MountedFile {
    hostPath: string;
    containerPath: string;
}
/**
 * Copy files into running container
 */
export declare function mountFiles(containerId: string, files: string[]): Promise<MountedFile[]>;
/**
 * Copy directory into container
 */
export declare function mountDirectory(containerId: string, dirPath: string): Promise<string>;
