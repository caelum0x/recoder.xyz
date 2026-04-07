"use strict";
/**
 * Port Manager Module
 *
 * Centralized port management for Docker containers with:
 * - In-memory port tracking (authoritative after initial sync)
 * - Smart port allocation starting from base port
 * - Port caching per container with labels
 * - Port release on container deletion
 * - Fallback logic for port conflicts
 * - Port reassignment if container restarts
 * - Background re-sync with Docker every 5 minutes
 *
 * Performance: Port allocation is synchronous after startup.
 * The in-memory usedPorts set is the source of truth for the hot path.
 * Docker API and lsof checks are only used during initial/periodic sync
 * and the exported isPortAvailable() diagnostic endpoint.
 *
 * Inspired by december's docker.ts port management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_LABEL = exports.PORTS_PER_CONTAINER = exports.MAX_PORT = exports.BASE_PORT = void 0;
exports.initPortManager = initPortManager;
exports.isPortAvailable = isPortAvailable;
exports.findAvailablePort = findAvailablePort;
exports.findAvailablePortWithVerification = findAvailablePortWithVerification;
exports.reservePort = reservePort;
exports.markPortBlockUnavailable = markPortBlockUnavailable;
exports.releasePort = releasePort;
exports.releasePortsByContainer = releasePortsByContainer;
exports.getContainerPort = getContainerPort;
exports.getContainerByPort = getContainerByPort;
exports.allocatePortBlock = allocatePortBlock;
exports.allocatePortBlockWithVerification = allocatePortBlockWithVerification;
exports.reassignPortForRestart = reassignPortForRestart;
exports.syncWithDocker = syncWithDocker;
exports.scanAndMarkUsedPorts = scanAndMarkUsedPorts;
exports.getPortStats = getPortStats;
exports.createPortLabels = createPortLabels;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Base port for allocations
const BASE_PORT = Number(process.env.PORT_BASE) || 10000;
exports.BASE_PORT = BASE_PORT;
const MAX_PORT = Number(process.env.PORT_MAX) || 20000;
exports.MAX_PORT = MAX_PORT;
const PORTS_PER_CONTAINER = 6; // preview, preview+1, preview+2, pty, expo(+4), expo-web(+5)
exports.PORTS_PER_CONTAINER = PORTS_PER_CONTAINER;
// Project label for identifying our containers
const PROJECT_LABEL = 'recoder';
exports.PROJECT_LABEL = PROJECT_LABEL;
// In-memory port tracking
const usedPorts = new Set();
// Port to container mapping for quick lookups
const portToContainer = new Map(); // port -> containerId
// Container to port mapping
const containerPorts = new Map(); // containerId -> ports
// Docker client instance (will be set by init)
let docker;
// Track when syncWithDocker was last called for background refresh
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let syncInProgress = false;
/**
 * Initialize the port manager with Docker client
 */
function initPortManager(dockerClient) {
    docker = dockerClient;
}
/**
 * Check if a specific port is available using lsof
 * This is more reliable than just checking our internal tracking
 */
async function isPortAvailable(port) {
    // First check our internal tracking
    if (usedPorts.has(port)) {
        return false;
    }
    // Then check with lsof for system-level availability
    try {
        const { stdout } = await execAsync(`lsof -i :${port} -t 2>/dev/null || true`);
        return stdout.trim() === '';
    }
    catch {
        // If lsof fails, assume port is available
        return true;
    }
}
/**
 * Check if a range of ports is available using in-memory tracking only.
 * After initial syncWithDocker() on startup, the in-memory usedPorts set
 * is authoritative -- no need for lsof or Docker API calls on the hot path.
 */
function arePortsAvailable(startPort, count) {
    for (let i = 0; i < count; i++) {
        if (usedPorts.has(startPort + i)) {
            return false;
        }
    }
    return true;
}
/**
 * Find an available port starting from a base port.
 *
 * Uses the in-memory usedPorts set directly -- no Docker API or lsof calls.
 * The set is authoritative after the initial syncWithDocker() on startup.
 * A background (non-blocking) re-sync is triggered if >5 minutes since last sync.
 *
 * @param basePort - Starting port to search from (default: BASE_PORT)
 * @param maxAttempts - Maximum number of ports to check (default: 2500)
 * @returns The first available port, or throws if none found
 */
function findAvailablePort(basePort = BASE_PORT, maxAttempts = 2500) {
    // Trigger a background sync if it's been more than 5 minutes since last sync
    if (Date.now() - lastSyncTime > SYNC_INTERVAL_MS && !syncInProgress) {
        syncInProgress = true;
        syncWithDocker()
            .catch((err) => console.error('[PortManager] Background sync failed:', err))
            .finally(() => { syncInProgress = false; });
    }
    // Search for a port block of PORTS_PER_CONTAINER using in-memory set only
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const port = basePort + (attempt * PORTS_PER_CONTAINER);
        // Skip if beyond max port range
        if (port + PORTS_PER_CONTAINER > MAX_PORT) {
            break;
        }
        // Check the entire block against the in-memory set
        if (arePortsAvailable(port, PORTS_PER_CONTAINER)) {
            return port;
        }
    }
    throw new Error(`No available ports found in range ${basePort}-${MAX_PORT}`);
}
/**
 * Find an available port with OS-level verification.
 * Use this for critical operations where we need to be sure the port is truly free.
 *
 * @param basePort - Starting port to search from (default: BASE_PORT)
 * @param maxAttempts - Maximum number of ports to check (default: 100)
 * @returns The first available port, or throws if none found
 */
async function findAvailablePortWithVerification(basePort = BASE_PORT, maxAttempts = 100) {
    // First, refresh our knowledge of used ports
    await scanAndMarkUsedPorts();
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const port = basePort + (attempt * PORTS_PER_CONTAINER);
        // Skip if beyond max port range
        if (port + PORTS_PER_CONTAINER > MAX_PORT) {
            break;
        }
        // Check the entire block against the in-memory set
        if (!arePortsAvailable(port, PORTS_PER_CONTAINER)) {
            continue;
        }
        // Double-check with lsof that the ports are truly free
        let allFree = true;
        for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
            const portToCheck = port + i;
            const isFree = await isPortAvailable(portToCheck);
            if (!isFree) {
                // Mark this port as used so we don't try it again
                usedPorts.add(portToCheck);
                allFree = false;
                break;
            }
        }
        if (allFree) {
            return port;
        }
    }
    throw new Error(`No available ports found in range ${basePort}-${MAX_PORT} after OS-level verification`);
}
/**
 * Reserve a port block for a container
 *
 * @param port - The base port to reserve
 * @param containerId - The container ID to associate with this port
 */
function reservePort(port, containerId) {
    // Reserve the full block
    for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
        usedPorts.add(port + i);
    }
    // Update mappings
    portToContainer.set(port, containerId);
    containerPorts.set(containerId, { preview: port, pty: port + 3 });
    console.log(`[PortManager] Reserved ports ${port}-${port + PORTS_PER_CONTAINER - 1} for container ${containerId.slice(0, 12)}`);
}
/**
 * Mark a port block as unavailable (e.g., detected conflict with external process)
 * This avoids retrying the same blocked ports.
 */
function markPortBlockUnavailable(port) {
    for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
        usedPorts.add(port + i);
    }
    console.warn(`[PortManager] Marked ports ${port}-${port + PORTS_PER_CONTAINER - 1} as unavailable`);
}
/**
 * Release ports when a container stops or is deleted
 *
 * @param port - The base port to release
 */
function releasePort(port) {
    const containerId = portToContainer.get(port);
    // Release the full block
    for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
        usedPorts.delete(port + i);
    }
    // Clean up mappings
    portToContainer.delete(port);
    if (containerId) {
        containerPorts.delete(containerId);
    }
    console.log(`[PortManager] Released ports ${port}-${port + PORTS_PER_CONTAINER - 1}${containerId ? ` from container ${containerId.slice(0, 12)}` : ''}`);
}
/**
 * Release ports by container ID
 *
 * @param containerId - The container ID whose ports should be released
 */
function releasePortsByContainer(containerId) {
    const ports = containerPorts.get(containerId);
    if (ports) {
        releasePort(ports.preview);
    }
}
/**
 * Get the port for a specific container
 *
 * @param containerId - The container ID to look up
 * @returns The port info or undefined if not found
 */
function getContainerPort(containerId) {
    return containerPorts.get(containerId);
}
/**
 * Get container ID by port
 *
 * @param port - The port to look up
 * @returns The container ID or undefined if not found
 */
function getContainerByPort(port) {
    return portToContainer.get(port);
}
/**
 * Allocate a full port block for a container
 * This combines findAvailablePort and reservePort
 *
 * @param containerId - Optional container ID to associate
 * @returns The allocated port block
 */
function allocatePortBlock(containerId) {
    const basePort = findAvailablePort();
    if (containerId) {
        reservePort(basePort, containerId);
    }
    else {
        // Just mark as used without container association
        for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
            usedPorts.add(basePort + i);
        }
    }
    return { preview: basePort, pty: basePort + 3 };
}
/**
 * Allocate a full port block with OS-level verification.
 * Use this for production container creation.
 *
 * @param containerId - Optional container ID to associate
 * @returns The allocated port block
 */
async function allocatePortBlockWithVerification(containerId) {
    const basePort = await findAvailablePortWithVerification();
    if (containerId) {
        reservePort(basePort, containerId);
    }
    else {
        // Just mark as used without container association
        for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
            usedPorts.add(basePort + i);
        }
    }
    return { preview: basePort, pty: basePort + 3 };
}
/**
 * Try to reclaim a previously assigned port for a restarting container
 * Returns the port if available, or allocates a new one if not
 *
 * @param containerId - The container being restarted
 * @param previousPort - The port the container had before
 * @returns The port to use (may be the same or different)
 */
function reassignPortForRestart(containerId, previousPort) {
    // Check if the previous port is still available
    const stillAvailable = arePortsAvailable(previousPort, PORTS_PER_CONTAINER);
    if (stillAvailable) {
        // Reclaim the same port
        reservePort(previousPort, containerId);
        console.log(`[PortManager] Reclaimed port ${previousPort} for restarting container ${containerId.slice(0, 12)}`);
        return { preview: previousPort, pty: previousPort + 3, changed: false };
    }
    // Port no longer available, allocate a new one
    console.log(`[PortManager] Previous port ${previousPort} no longer available, allocating new port for container ${containerId.slice(0, 12)}`);
    const newPorts = allocatePortBlock(containerId);
    return { ...newPorts, changed: true };
}
/**
 * Sync internal state with actual Docker containers
 * Call this on startup to recover from crashes
 */
async function syncWithDocker() {
    console.log('[PortManager] Syncing port state with Docker containers...');
    try {
        const containers = await docker.listContainers({ all: true });
        // Clear existing state
        usedPorts.clear();
        portToContainer.clear();
        containerPorts.clear();
        let syncedCount = 0;
        const markUsedPort = (port) => {
            if (port >= BASE_PORT && port <= MAX_PORT) {
                usedPorts.add(port);
            }
        };
        const inferBasePort = (ports) => {
            if (ports.length < PORTS_PER_CONTAINER)
                return undefined;
            const portSet = new Set(ports);
            const sorted = Array.from(portSet).sort((a, b) => a - b);
            for (const port of sorted) {
                let blockOk = true;
                for (let i = 0; i < PORTS_PER_CONTAINER; i++) {
                    if (!portSet.has(port + i)) {
                        blockOk = false;
                        break;
                    }
                }
                if (blockOk)
                    return port;
            }
            return undefined;
        };
        for (const container of containers) {
            const publicPorts = (container.Ports || [])
                .map((p) => p.PublicPort)
                .filter((p) => typeof p === 'number');
            // Always mark host ports as used to avoid conflicts with non-recoder containers.
            for (const port of publicPorts) {
                markUsedPort(port);
            }
            // Only map port blocks for our containers
            const isRecoderContainer = container.Labels?.project === PROJECT_LABEL ||
                container.Names?.some((name) => name.includes('recoder-'));
            if (!isRecoderContainer) {
                continue;
            }
            // Prefer label-based port assignment
            const assignedPort = container.Labels?.assignedPort;
            if (assignedPort) {
                const port = parseInt(assignedPort, 10);
                if (!isNaN(port)) {
                    reservePort(port, container.Id);
                    syncedCount++;
                    continue;
                }
            }
            // Fallback: infer base port from published ports
            const inferredBase = inferBasePort(publicPorts);
            if (inferredBase !== undefined) {
                reservePort(inferredBase, container.Id);
                syncedCount++;
            }
        }
        // Also scan for ports used by any process (not just our containers)
        await scanAndMarkUsedPorts();
        lastSyncTime = Date.now();
        console.log(`[PortManager] Synced ${syncedCount} container port assignments`);
    }
    catch (error) {
        console.error('[PortManager] Error syncing with Docker:', error);
    }
}
/**
 * Scan for all ports in our range that are already in use by any process
 * This prevents port conflicts with orphaned containers or other processes
 */
async function scanAndMarkUsedPorts() {
    console.log('[PortManager] Scanning for used ports in range...');
    let markedCount = 0;
    try {
        // Use lsof to find all listening ports in our range
        const { stdout } = await execAsync(`lsof -iTCP:${BASE_PORT}-${MAX_PORT} -sTCP:LISTEN -P -n 2>/dev/null | grep LISTEN | awk '{print $9}' | sed 's/.*://' | sort -u || true`);
        const portsInUse = stdout.trim().split('\n')
            .filter(p => p.length > 0)
            .map(p => parseInt(p, 10))
            .filter(p => !isNaN(p) && p >= BASE_PORT && p <= MAX_PORT);
        for (const port of portsInUse) {
            if (!usedPorts.has(port)) {
                usedPorts.add(port);
                markedCount++;
            }
        }
        if (markedCount > 0) {
            console.log(`[PortManager] Marked ${markedCount} externally used ports as unavailable: ${portsInUse.join(', ')}`);
        }
    }
    catch (error) {
        console.warn('[PortManager] Failed to scan for used ports:', error);
    }
    return markedCount;
}
/**
 * Get statistics about port usage
 */
function getPortStats() {
    return {
        usedPortCount: usedPorts.size,
        containerCount: containerPorts.size,
        usedPorts: Array.from(usedPorts).sort((a, b) => a - b),
        portRange: { min: BASE_PORT, max: MAX_PORT },
    };
}
/**
 * Create Docker labels for port tracking
 * Use these labels when creating containers
 */
function createPortLabels(port) {
    return {
        project: PROJECT_LABEL,
        assignedPort: port.toString(),
        portAllocatedAt: new Date().toISOString(),
    };
}
