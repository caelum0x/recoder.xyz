"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverContainerFromDocker = recoverContainerFromDocker;
function matchesProject(containerInfo, projectId) {
    if (containerInfo.Labels?.projectId === projectId) {
        return true;
    }
    const mounts = containerInfo.Mounts || [];
    return mounts.some((mount) => Boolean(mount.Name?.includes(`recoder-${projectId}`)));
}
function resolveBasePort(containerInfo) {
    const ports = containerInfo.Ports || [];
    let port3000Host = 0;
    let port5173Host = 0;
    let port8080Host = 0;
    let port9999Host = 0;
    for (const port of ports) {
        if (port.PrivatePort === 3000 && port.PublicPort)
            port3000Host = port.PublicPort;
        if (port.PrivatePort === 5173 && port.PublicPort)
            port5173Host = port.PublicPort;
        if (port.PrivatePort === 8080 && port.PublicPort)
            port8080Host = port.PublicPort;
        if (port.PrivatePort === 9999 && port.PublicPort)
            port9999Host = port.PublicPort;
    }
    const basePort = port3000Host || (port5173Host ? port5173Host - 1 : 0) || (port8080Host ? port8080Host - 2 : 0);
    if (basePort <= 0) {
        return undefined;
    }
    return {
        basePort,
        ptyPort: port9999Host || basePort + 3,
    };
}
async function recoverContainerFromDocker(docker, projectId, containers, logger = console) {
    try {
        const allContainers = await docker.listContainers({ all: false });
        for (const containerInfo of allContainers) {
            if (!matchesProject(containerInfo, projectId)) {
                continue;
            }
            const resolvedPorts = resolveBasePort(containerInfo);
            if (!resolvedPorts) {
                continue;
            }
            const recovered = {
                id: containerInfo.Id,
                lastActive: Date.now(),
                port: resolvedPorts.basePort,
                ptyPort: resolvedPorts.ptyPort,
                userId: containerInfo.Labels?.userId,
            };
            logger.log?.(`🔄 [ContainerRecovery] Recovered container for ${projectId}: ${containerInfo.Id.slice(0, 12)} (port: ${resolvedPorts.basePort})`);
            containers.set(projectId, recovered);
            return recovered;
        }
        logger.log?.(`❌ [ContainerRecovery] No running Docker container found for ${projectId}`);
        return undefined;
    }
    catch (err) {
        logger.error?.(`❌ [ContainerRecovery] Error recovering Docker container for ${projectId}:`, err);
        return undefined;
    }
}
