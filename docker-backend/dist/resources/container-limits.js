"use strict";
/**
 * Container Resource Limits
 * Applies Docker container resource limits based on user tier
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContainerResourceConfig = createContainerResourceConfig;
exports.getContainerHostConfig = getContainerHostConfig;
exports.updateContainerLimits = updateContainerLimits;
exports.getContainerLimits = getContainerLimits;
exports.verifyContainerLimits = verifyContainerLimits;
exports.applyNetworkBandwidthLimit = applyNetworkBandwidthLimit;
exports.createResourceLabels = createResourceLabels;
exports.logContainerResourceConfig = logContainerResourceConfig;
const tier_limits_js_1 = require("./tier-limits.js");
// ==================== Docker Resource Configuration ====================
/**
 * Convert resource limits to Docker container config
 */
function createContainerResourceConfig(limits) {
    const cpuPeriod = 100000; // Standard CPU period (100ms)
    const cpuQuota = Math.round(cpuPeriod * limits.cpu);
    return {
        CpuPeriod: cpuPeriod,
        CpuQuota: cpuQuota,
        Memory: limits.memory,
        MemorySwap: limits.memory, // Same as memory to disable swap
        PidsLimit: limits.pidsLimit,
        Ulimits: [
            {
                Name: 'nofile',
                Soft: Math.min(4096, limits.pidsLimit * 32),
                Hard: Math.min(8192, limits.pidsLimit * 64),
            },
            {
                Name: 'nproc',
                Soft: Math.round(limits.pidsLimit * 0.5),
                Hard: limits.pidsLimit,
            },
        ],
        Tmpfs: {
            '/tmp': `rw,noexec,nosuid,size=${Math.round(limits.memory * 0.25)}`, // 25% of memory for /tmp
        },
    };
}
/**
 * Get Docker HostConfig for container creation with tier-based limits
 */
function getContainerHostConfig(tier, additionalConfig) {
    const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
    const resourceConfig = createContainerResourceConfig(limits);
    return {
        // Resource limits from tier
        Memory: resourceConfig.Memory,
        MemorySwap: resourceConfig.MemorySwap,
        CpuPeriod: resourceConfig.CpuPeriod,
        CpuQuota: resourceConfig.CpuQuota,
        PidsLimit: resourceConfig.PidsLimit,
        Ulimits: resourceConfig.Ulimits,
        Tmpfs: resourceConfig.Tmpfs,
        // Security hardening (always applied)
        SecurityOpt: ['no-new-privileges', 'seccomp=unconfined'],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
        ReadonlyRootfs: false,
        // Merge with additional config
        ...additionalConfig,
    };
}
/**
 * Apply resource limits to an existing running container
 * Note: Some limits can only be changed when container is recreated
 */
async function updateContainerLimits(docker, containerId, limits) {
    try {
        const container = docker.getContainer(containerId);
        const info = await container.inspect();
        if (!info.State.Running) {
            return {
                success: false,
                message: 'Container is not running',
            };
        }
        // Update container with new limits
        // Note: Docker only allows updating certain limits at runtime
        await container.update({
            Memory: limits.memory,
            MemorySwap: limits.memory,
            CpuPeriod: 100000,
            CpuQuota: Math.round(100000 * limits.cpu),
            // PidsLimit cannot be updated at runtime on most Docker versions
        });
        console.log(`[ContainerLimits] Updated limits for container ${containerId.slice(0, 12)}: CPU=${limits.cpu}, Memory=${limits.memoryMB}MB`);
        return {
            success: true,
            message: `Updated container limits: CPU=${limits.cpu}, Memory=${limits.memoryMB}MB`,
        };
    }
    catch (error) {
        console.error(`[ContainerLimits] Failed to update container ${containerId}: ${error.message}`);
        return {
            success: false,
            message: `Failed to update limits: ${error.message}`,
        };
    }
}
/**
 * Get current resource limits of a running container
 */
async function getContainerLimits(docker, containerId) {
    try {
        const container = docker.getContainer(containerId);
        const info = await container.inspect();
        const hostConfig = info.HostConfig;
        const cpuQuota = hostConfig.CpuQuota || 0;
        const cpuPeriod = hostConfig.CpuPeriod || 100000;
        return {
            cpu: cpuQuota > 0 ? cpuQuota / cpuPeriod : 0,
            memoryMB: Math.round((hostConfig.Memory || 0) / (1024 * 1024)),
            pidsLimit: hostConfig.PidsLimit || 0,
        };
    }
    catch (error) {
        console.error(`[ContainerLimits] Failed to get limits for container ${containerId}: ${error.message}`);
        return null;
    }
}
/**
 * Verify container is running within its resource limits
 */
async function verifyContainerLimits(docker, containerId, expectedLimits) {
    const issues = [];
    try {
        const container = docker.getContainer(containerId);
        const info = await container.inspect();
        const hostConfig = info.HostConfig;
        // Check memory limit
        const actualMemory = hostConfig.Memory || 0;
        if (actualMemory > expectedLimits.memory) {
            issues.push(`Memory limit ${actualMemory} exceeds allowed ${expectedLimits.memory}`);
        }
        // Check CPU limit
        const cpuQuota = hostConfig.CpuQuota || 0;
        const cpuPeriod = hostConfig.CpuPeriod || 100000;
        const actualCpu = cpuQuota > 0 ? cpuQuota / cpuPeriod : 0;
        if (actualCpu > expectedLimits.cpu + 0.01) { // Small tolerance for floating point
            issues.push(`CPU limit ${actualCpu} exceeds allowed ${expectedLimits.cpu}`);
        }
        // Check PIDs limit
        const actualPids = hostConfig.PidsLimit || 0;
        if (actualPids > expectedLimits.pidsLimit && actualPids !== -1) {
            issues.push(`PIDs limit ${actualPids} exceeds allowed ${expectedLimits.pidsLimit}`);
        }
        return {
            valid: issues.length === 0,
            issues,
        };
    }
    catch (error) {
        return {
            valid: false,
            issues: [`Failed to verify limits: ${error.message}`],
        };
    }
}
// ==================== Network Bandwidth Limiting ====================
/**
 * Apply network bandwidth limits using tc (traffic control)
 * Note: This requires NET_ADMIN capability and tc installed in container
 * For production, consider using Docker networks with bandwidth limits instead
 */
async function applyNetworkBandwidthLimit(docker, containerId, bandwidthMbps) {
    try {
        const container = docker.getContainer(containerId);
        // Check if container is running
        const info = await container.inspect();
        if (!info.State.Running) {
            return {
                success: false,
                message: 'Container is not running',
            };
        }
        // Skip if bandwidth limit is very high (essentially unlimited)
        if (bandwidthMbps >= 1000) {
            console.log(`[ContainerLimits] Skipping bandwidth limit for container ${containerId.slice(0, 12)} (limit >= 1Gbps)`);
            return {
                success: true,
                message: 'Bandwidth limiting skipped (effectively unlimited)',
            };
        }
        // Apply tc rate limit using qdisc
        // Note: This is a simplified approach. For production, consider:
        // 1. Using Docker networks with bandwidth limits
        // 2. Using cgroup net_cls for traffic shaping
        // 3. Using external traffic control tools
        const bandwidthKbps = bandwidthMbps * 1000;
        const burstKb = Math.max(32, Math.round(bandwidthMbps * 10)); // Burst = 10ms worth
        const exec = await container.exec({
            Cmd: [
                'sh', '-c',
                `tc qdisc replace dev eth0 root tbf rate ${bandwidthKbps}kbit burst ${burstKb}kb latency 50ms 2>/dev/null || echo "tc not available"`,
            ],
            AttachStdout: true,
            AttachStderr: true,
            User: 'root',
        });
        const stream = await exec.start({ Detach: false });
        const output = await collectStreamOutput(stream);
        if (output.includes('tc not available')) {
            // tc not available, this is expected in many container environments
            console.log(`[ContainerLimits] tc not available in container ${containerId.slice(0, 12)}, bandwidth limiting not applied`);
            return {
                success: true,
                message: 'Bandwidth limiting not available (tc not installed)',
            };
        }
        console.log(`[ContainerLimits] Applied ${bandwidthMbps}Mbps bandwidth limit to container ${containerId.slice(0, 12)}`);
        return {
            success: true,
            message: `Applied ${bandwidthMbps}Mbps bandwidth limit`,
        };
    }
    catch (error) {
        console.error(`[ContainerLimits] Failed to apply bandwidth limit: ${error.message}`);
        return {
            success: false,
            message: `Failed to apply bandwidth limit: ${error.message}`,
        };
    }
}
/**
 * Helper to collect stream output
 */
async function collectStreamOutput(stream) {
    return new Promise((resolve) => {
        let output = '';
        stream.on('data', (chunk) => {
            output += chunk.toString();
        });
        stream.on('end', () => {
            resolve(output);
        });
        stream.on('error', () => {
            resolve(output);
        });
        // Set timeout to avoid hanging
        setTimeout(() => resolve(output), 5000);
    });
}
// ==================== Tier-Based Container Creation ====================
/**
 * Create container labels for resource tracking
 */
function createResourceLabels(tier, userId, projectId) {
    const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
    return {
        'recoder.tier': tier,
        'recoder.userId': userId,
        'recoder.projectId': projectId,
        'recoder.cpu': String(limits.cpu),
        'recoder.memoryMB': String(limits.memoryMB),
        'recoder.storageGB': String(limits.storageGB),
        'recoder.createdAt': new Date().toISOString(),
    };
}
/**
 * Log container resource configuration
 */
function logContainerResourceConfig(tier, projectId) {
    const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
    console.log(`[ContainerLimits] Container config for ${projectId} (${tier}):`);
    console.log(`  CPU: ${limits.cpu} cores`);
    console.log(`  Memory: ${limits.memoryMB} MB`);
    console.log(`  Storage: ${limits.storageGB} GB`);
    console.log(`  Network: ${limits.networkBandwidth} Mbps`);
    console.log(`  PIDs: ${limits.pidsLimit}`);
}
