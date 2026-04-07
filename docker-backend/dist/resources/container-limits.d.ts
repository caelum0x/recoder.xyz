/**
 * Container Resource Limits
 * Applies Docker container resource limits based on user tier
 */
import Docker from 'dockerode';
import { SubscriptionTier, ResourceLimits, ContainerResourceConfig } from './types.js';
/**
 * Convert resource limits to Docker container config
 */
export declare function createContainerResourceConfig(limits: ResourceLimits): ContainerResourceConfig;
/**
 * Get Docker HostConfig for container creation with tier-based limits
 */
export declare function getContainerHostConfig(tier: SubscriptionTier, additionalConfig?: Partial<Docker.ContainerCreateOptions['HostConfig']>): Docker.ContainerCreateOptions['HostConfig'];
/**
 * Apply resource limits to an existing running container
 * Note: Some limits can only be changed when container is recreated
 */
export declare function updateContainerLimits(docker: Docker, containerId: string, limits: ResourceLimits): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Get current resource limits of a running container
 */
export declare function getContainerLimits(docker: Docker, containerId: string): Promise<{
    cpu: number;
    memoryMB: number;
    pidsLimit: number;
} | null>;
/**
 * Verify container is running within its resource limits
 */
export declare function verifyContainerLimits(docker: Docker, containerId: string, expectedLimits: ResourceLimits): Promise<{
    valid: boolean;
    issues: string[];
}>;
/**
 * Apply network bandwidth limits using tc (traffic control)
 * Note: This requires NET_ADMIN capability and tc installed in container
 * For production, consider using Docker networks with bandwidth limits instead
 */
export declare function applyNetworkBandwidthLimit(docker: Docker, containerId: string, bandwidthMbps: number): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Create container labels for resource tracking
 */
export declare function createResourceLabels(tier: SubscriptionTier, userId: string, projectId: string): Record<string, string>;
/**
 * Log container resource configuration
 */
export declare function logContainerResourceConfig(tier: SubscriptionTier, projectId: string): void;
