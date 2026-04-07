"use strict";
/**
 * Vercel Deployment Provider
 * Handles deployment to Vercel via their REST API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = validateToken;
exports.getUser = getUser;
exports.listProjects = listProjects;
exports.getProject = getProject;
exports.createProject = createProject;
exports.deleteProject = deleteProject;
exports.deploy = deploy;
exports.getDeployment = getDeployment;
exports.listDeployments = listDeployments;
exports.deleteDeployment = deleteDeployment;
exports.cancelDeployment = cancelDeployment;
exports.listDomains = listDomains;
exports.addDomain = addDomain;
exports.removeDomain = removeDomain;
exports.listEnvVars = listEnvVars;
exports.setEnvVar = setEnvVar;
exports.deleteEnvVar = deleteEnvVar;
exports.getBuildLogs = getBuildLogs;
exports.rollback = rollback;
const node_fetch_1 = __importDefault(require("node-fetch"));
const VERCEL_API_URL = 'https://api.vercel.com';
async function vercelApi(endpoint, options) {
    const { method = 'GET', body, token, teamId } = options;
    let url = `${VERCEL_API_URL}${endpoint}`;
    if (teamId) {
        url += `${url.includes('?') ? '&' : '?'}teamId=${teamId}`;
    }
    const response = await (0, node_fetch_1.default)(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message ||
            `Vercel API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
async function validateToken(token) {
    try {
        const user = await vercelApi('/v2/user', { token });
        return { valid: true, user };
    }
    catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Invalid token',
        };
    }
}
async function getUser(token) {
    return vercelApi('/v2/user', { token });
}
// ============================================
// Projects
// ============================================
async function listProjects(credentials, options) {
    const params = new URLSearchParams();
    if (options?.limit)
        params.set('limit', String(options.limit));
    if (options?.search)
        params.set('search', options.search);
    const query = params.toString();
    const endpoint = `/v9/projects${query ? `?${query}` : ''}`;
    const response = await vercelApi(endpoint, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return response.projects;
}
async function getProject(credentials, projectId) {
    return vercelApi(`/v9/projects/${projectId}`, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function createProject(credentials, config) {
    return vercelApi('/v10/projects', {
        method: 'POST',
        body: {
            name: config.name,
            framework: config.framework,
            buildCommand: config.buildCommand,
            outputDirectory: config.outputDirectory,
            installCommand: config.installCommand,
            rootDirectory: config.rootDirectory,
            environmentVariables: config.environmentVariables,
        },
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function deleteProject(credentials, projectId) {
    await vercelApi(`/v9/projects/${projectId}`, {
        method: 'DELETE',
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
// ============================================
// Deployments
// ============================================
function mapVercelStatus(state) {
    switch (state) {
        case 'QUEUED':
        case 'INITIALIZING':
            return 'queued';
        case 'BUILDING':
        case 'ANALYZING':
            return 'building';
        case 'DEPLOYING':
            return 'deploying';
        case 'READY':
            return 'ready';
        case 'ERROR':
        case 'FAILED':
            return 'error';
        case 'CANCELED':
            return 'cancelled';
        default:
            return 'queued';
    }
}
function mapVercelDeployment(deployment, projectId) {
    const status = mapVercelStatus(deployment.readyState || deployment.state);
    return {
        id: deployment.id,
        provider: 'vercel',
        projectId,
        providerProjectId: deployment.name,
        url: deployment.url ? `https://${deployment.url}` : '',
        deploymentUrl: deployment.url ? `https://${deployment.url}` : undefined,
        productionUrl: deployment.alias?.[0] ? `https://${deployment.alias[0]}` : undefined,
        inspectorUrl: deployment.inspectorUrl,
        status,
        createdAt: deployment.createdAt,
        updatedAt: deployment.createdAt,
        completedAt: deployment.ready,
        buildTime: deployment.ready && deployment.buildingAt
            ? deployment.ready - deployment.buildingAt
            : undefined,
        meta: deployment.meta,
    };
}
async function deploy(credentials, config, files, onProgress) {
    const startTime = Date.now();
    const logs = [];
    const addLog = (message, level = 'info') => {
        logs.push({
            timestamp: Date.now(),
            level,
            message,
            source: 'vercel',
        });
    };
    // Report progress
    const reportProgress = (phase, progress, message) => {
        onProgress?.({
            phase,
            progress,
            message,
            startedAt: startTime,
            logs,
        });
    };
    try {
        addLog(`Starting deployment to Vercel...`);
        reportProgress('preparing', 5, 'Preparing deployment...');
        // Create or get project
        let vercelProject;
        if (config.projectId) {
            try {
                vercelProject = await getProject(credentials, config.projectId);
                addLog(`Using existing project: ${vercelProject.name}`);
            }
            catch {
                // Project doesn't exist, create it
            }
        }
        if (!vercelProject) {
            addLog(`Creating new project: ${config.projectName}`);
            reportProgress('preparing', 10, 'Creating project...');
            const envVars = config.environmentVariables
                ? Object.entries(config.environmentVariables).map(([key, value]) => ({
                    key,
                    value,
                    target: ['production', 'preview', 'development'],
                }))
                : undefined;
            vercelProject = await createProject(credentials, {
                name: config.projectName,
                framework: config.framework,
                buildCommand: config.buildCommand,
                outputDirectory: config.outputDirectory,
                installCommand: config.installCommand,
                rootDirectory: config.rootDirectory,
                environmentVariables: envVars,
            });
        }
        // Convert files to Vercel format
        addLog(`Preparing ${Object.keys(files).length} files for upload...`);
        reportProgress('uploading', 20, 'Uploading files...');
        const fileArray = Object.entries(files).map(([file, data]) => ({
            file: file.startsWith('/') ? file.slice(1) : file,
            data,
        }));
        // Create deployment
        addLog(`Creating deployment...`);
        reportProgress('uploading', 40, 'Creating deployment...');
        const deploymentBody = {
            name: vercelProject.name,
            files: fileArray,
            projectSettings: {
                framework: config.framework,
                buildCommand: config.buildCommand,
                outputDirectory: config.outputDirectory,
                installCommand: config.installCommand,
                rootDirectory: config.rootDirectory,
                nodeVersion: config.nodeVersion,
            },
            target: config.production ? 'production' : 'preview',
        };
        let url = '/v13/deployments';
        if (credentials.teamId) {
            url += `?teamId=${credentials.teamId}`;
        }
        const deployResponse = await (0, node_fetch_1.default)(`${VERCEL_API_URL}${url}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(deploymentBody),
        });
        if (!deployResponse.ok) {
            const error = await deployResponse.json().catch(() => ({}));
            throw new Error(error.error?.message || `Deployment failed: ${deployResponse.status}`);
        }
        const vercelDeployment = await deployResponse.json();
        addLog(`Deployment created: ${vercelDeployment.id}`);
        reportProgress('building', 50, 'Building...');
        // Poll for deployment status
        const deployment = await pollDeploymentStatus(credentials, vercelDeployment.id, config.projectId || vercelProject.id, (status, progress, message) => {
            addLog(message);
            reportProgress('building', 50 + progress * 0.4, message);
        });
        addLog(`Deployment complete: ${deployment.url}`);
        reportProgress('complete', 100, 'Deployment complete!');
        return {
            ...deployment,
            progress: {
                phase: 'complete',
                progress: 100,
                message: 'Deployment complete!',
                startedAt: startTime,
                completedAt: Date.now(),
                logs,
            },
        };
    }
    catch (error) {
        addLog(error instanceof Error ? error.message : 'Deployment failed', 'error');
        reportProgress('error', 0, error instanceof Error ? error.message : 'Deployment failed');
        throw error;
    }
}
async function pollDeploymentStatus(credentials, deploymentId, projectId, onProgress, maxAttempts = 120, interval = 2000) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const response = await vercelApi(`/v13/deployments/${deploymentId}`, {
            token: credentials.token,
            teamId: credentials.teamId,
        });
        const status = response.readyState || response.state;
        const progress = Math.min(attempts / maxAttempts, 0.9);
        onProgress?.(status, progress, `Status: ${status}`);
        if (status === 'READY') {
            return mapVercelDeployment(response, projectId);
        }
        if (status === 'ERROR' || status === 'CANCELED') {
            const deployment = mapVercelDeployment(response, projectId);
            deployment.error = {
                code: status,
                message: `Deployment ${status.toLowerCase()}`,
            };
            throw new Error(`Deployment ${status.toLowerCase()}`);
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
    }
    throw new Error('Deployment timed out');
}
async function getDeployment(credentials, deploymentId, projectId) {
    const response = await vercelApi(`/v13/deployments/${deploymentId}`, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return mapVercelDeployment(response, projectId);
}
async function listDeployments(credentials, options) {
    const params = new URLSearchParams();
    if (options?.projectId)
        params.set('projectId', options.projectId);
    if (options?.limit)
        params.set('limit', String(options.limit));
    if (options?.target)
        params.set('target', options.target);
    if (options?.state)
        params.set('state', options.state);
    const query = params.toString();
    const endpoint = `/v6/deployments${query ? `?${query}` : ''}`;
    const response = await vercelApi(endpoint, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return response.deployments.map((d) => mapVercelDeployment(d, options?.projectId || d.name));
}
async function deleteDeployment(credentials, deploymentId) {
    await vercelApi(`/v13/deployments/${deploymentId}`, {
        method: 'DELETE',
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function cancelDeployment(credentials, deploymentId) {
    await vercelApi(`/v12/deployments/${deploymentId}/cancel`, {
        method: 'PATCH',
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function listDomains(credentials, projectId) {
    const response = await vercelApi(`/v9/projects/${projectId}/domains`, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return response.domains;
}
async function addDomain(credentials, projectId, domain) {
    return vercelApi(`/v9/projects/${projectId}/domains`, {
        method: 'POST',
        body: { name: domain },
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function removeDomain(credentials, projectId, domain) {
    await vercelApi(`/v9/projects/${projectId}/domains/${domain}`, {
        method: 'DELETE',
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function listEnvVars(credentials, projectId) {
    const response = await vercelApi(`/v9/projects/${projectId}/env`, {
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return response.envs;
}
async function setEnvVar(credentials, projectId, envVar) {
    return vercelApi(`/v10/projects/${projectId}/env`, {
        method: 'POST',
        body: {
            key: envVar.key,
            value: envVar.value,
            type: envVar.type || 'encrypted',
            target: envVar.target || ['production', 'preview', 'development'],
        },
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
async function deleteEnvVar(credentials, projectId, envVarId) {
    await vercelApi(`/v9/projects/${projectId}/env/${envVarId}`, {
        method: 'DELETE',
        token: credentials.token,
        teamId: credentials.teamId,
    });
}
// ============================================
// Logs
// ============================================
async function getBuildLogs(credentials, deploymentId) {
    try {
        const response = await vercelApi(`/v2/deployments/${deploymentId}/events`, {
            token: credentials.token,
            teamId: credentials.teamId,
        });
        return response.logs?.map((log) => log.text) || [];
    }
    catch {
        return [];
    }
}
// ============================================
// Rollback
// ============================================
async function rollback(credentials, projectId, deploymentId) {
    // Vercel doesn't have a direct rollback API, but we can promote a deployment
    const response = await vercelApi(`/v12/deployments/${deploymentId}/promote`, {
        method: 'POST',
        token: credentials.token,
        teamId: credentials.teamId,
    });
    return mapVercelDeployment(response, projectId);
}
