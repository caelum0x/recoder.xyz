"use strict";
/**
 * Netlify Deployment Provider
 * Handles deployment to Netlify via their REST API
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = validateToken;
exports.getUser = getUser;
exports.listSites = listSites;
exports.getSite = getSite;
exports.createSite = createSite;
exports.deleteSite = deleteSite;
exports.updateSite = updateSite;
exports.deploy = deploy;
exports.getDeployment = getDeployment;
exports.listDeployments = listDeployments;
exports.deleteDeployment = deleteDeployment;
exports.cancelDeployment = cancelDeployment;
exports.listEnvVars = listEnvVars;
exports.setEnvVar = setEnvVar;
exports.createEnvVar = createEnvVar;
exports.deleteEnvVar = deleteEnvVar;
exports.listDomains = listDomains;
exports.addDomain = addDomain;
exports.rollback = rollback;
exports.listBuildHooks = listBuildHooks;
exports.createBuildHook = createBuildHook;
exports.deleteBuildHook = deleteBuildHook;
exports.triggerBuildHook = triggerBuildHook;
const node_fetch_1 = __importDefault(require("node-fetch"));
const crypto = __importStar(require("crypto"));
const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';
async function netlifyApi(endpoint, options) {
    const { method = 'GET', body, token, contentType = 'application/json' } = options;
    const headers = {
        Authorization: `Bearer ${token}`,
    };
    if (contentType) {
        headers['Content-Type'] = contentType;
    }
    const response = await (0, node_fetch_1.default)(`${NETLIFY_API_URL}${endpoint}`, {
        method,
        headers,
        body: body
            ? contentType === 'application/json'
                ? JSON.stringify(body)
                : body
            : undefined,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || `Netlify API error: ${response.status} ${response.statusText}`);
    }
    // Some endpoints return no content
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}
async function validateToken(token) {
    try {
        const user = await netlifyApi('/user', { token });
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
    return netlifyApi('/user', { token });
}
// ============================================
// Sites
// ============================================
async function listSites(credentials, options) {
    const params = new URLSearchParams();
    if (options?.filter)
        params.set('filter', options.filter);
    const query = params.toString();
    const endpoint = `/sites${query ? `?${query}` : ''}`;
    return netlifyApi(endpoint, { token: credentials.token });
}
async function getSite(credentials, siteId) {
    return netlifyApi(`/sites/${siteId}`, { token: credentials.token });
}
async function createSite(credentials, config) {
    return netlifyApi('/sites', {
        method: 'POST',
        body: {
            name: config.name,
            custom_domain: config.customDomain,
            password: config.password,
        },
        token: credentials.token,
    });
}
async function deleteSite(credentials, siteId) {
    await netlifyApi(`/sites/${siteId}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
async function updateSite(credentials, siteId, updates) {
    return netlifyApi(`/sites/${siteId}`, {
        method: 'PATCH',
        body: {
            name: updates.name,
            custom_domain: updates.customDomain,
            build_settings: updates.buildSettings
                ? {
                    cmd: updates.buildSettings.cmd,
                    dir: updates.buildSettings.dir,
                    env: updates.buildSettings.env,
                }
                : undefined,
        },
        token: credentials.token,
    });
}
// ============================================
// Deployments
// ============================================
function mapNetlifyStatus(state) {
    switch (state) {
        case 'uploading':
        case 'uploaded':
        case 'prepared':
            return 'queued';
        case 'preparing':
        case 'building':
        case 'processing':
            return 'building';
        case 'ready':
            return 'ready';
        case 'error':
            return 'error';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'queued';
    }
}
function mapNetlifyDeployment(deploy, projectId) {
    const status = mapNetlifyStatus(deploy.state);
    return {
        id: deploy.id,
        provider: 'netlify',
        projectId,
        providerProjectId: deploy.site_id,
        url: deploy.ssl_url || deploy.url,
        deploymentUrl: deploy.deploy_url,
        productionUrl: deploy.ssl_url,
        inspectorUrl: deploy.admin_url,
        status,
        createdAt: new Date(deploy.created_at).getTime(),
        updatedAt: new Date(deploy.updated_at).getTime(),
        completedAt: deploy.published_at
            ? new Date(deploy.published_at).getTime()
            : undefined,
        buildTime: deploy.deploy_time ? deploy.deploy_time * 1000 : undefined,
        error: deploy.error_message
            ? { code: 'BUILD_ERROR', message: deploy.error_message }
            : undefined,
        meta: {
            context: deploy.context,
        },
    };
}
/**
 * Calculate SHA1 hash of file content
 */
function calculateSha1(content) {
    return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}
async function deploy(credentials, config, files, onProgress) {
    const startTime = Date.now();
    const logs = [];
    const addLog = (message, level = 'info') => {
        logs.push({
            timestamp: Date.now(),
            level,
            message,
            source: 'netlify',
        });
    };
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
        addLog('Starting deployment to Netlify...');
        reportProgress('preparing', 5, 'Preparing deployment...');
        // Create or get site
        let site;
        if (config.siteId) {
            try {
                site = await getSite(credentials, config.siteId);
                addLog(`Using existing site: ${site.name}`);
            }
            catch {
                // Site doesn't exist
            }
        }
        if (!site) {
            addLog(`Creating new site: ${config.projectName}`);
            reportProgress('preparing', 10, 'Creating site...');
            site = await createSite(credentials, { name: config.projectName });
        }
        // Calculate file hashes for digest deploy
        addLog(`Preparing ${Object.keys(files).length} files for upload...`);
        reportProgress('uploading', 20, 'Calculating file hashes...');
        const fileHashes = {};
        const fileContents = {};
        for (const [path, content] of Object.entries(files)) {
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            const hash = calculateSha1(content);
            fileHashes[normalizedPath] = hash;
            fileContents[hash] = content;
        }
        // Create deploy with digest
        addLog('Creating deployment...');
        reportProgress('uploading', 30, 'Creating deployment...');
        const deployResponse = await netlifyApi(`/sites/${site.id}/deploys`, {
            method: 'POST',
            body: {
                files: fileHashes,
                draft: !config.production,
                title: config.projectName,
            },
            token: credentials.token,
        });
        const deployId = deployResponse.id;
        const requiredFiles = deployResponse.required || [];
        addLog(`Deploy created: ${deployId}, uploading ${requiredFiles.length} files...`);
        reportProgress('uploading', 40, `Uploading ${requiredFiles.length} files...`);
        // Upload required files
        let uploadedCount = 0;
        for (const hash of requiredFiles) {
            const content = fileContents[hash];
            if (!content)
                continue;
            await (0, node_fetch_1.default)(`${NETLIFY_API_URL}/deploys/${deployId}/files/${hash}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${credentials.token}`,
                    'Content-Type': 'application/octet-stream',
                },
                body: content,
            });
            uploadedCount++;
            const progress = 40 + (uploadedCount / requiredFiles.length) * 30;
            reportProgress('uploading', progress, `Uploaded ${uploadedCount}/${requiredFiles.length} files`);
        }
        addLog('Files uploaded, waiting for deployment...');
        reportProgress('building', 70, 'Deploying...');
        // Poll for deployment status
        const deployment = await pollDeploymentStatus(credentials, deployId, site.id, config.projectId || site.id, (status, progress, message) => {
            addLog(message);
            reportProgress('deploying', 70 + progress * 0.25, message);
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
async function pollDeploymentStatus(credentials, deployId, siteId, projectId, onProgress, maxAttempts = 120, interval = 2000) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const response = await netlifyApi(`/sites/${siteId}/deploys/${deployId}`, { token: credentials.token });
        const status = response.state;
        const progress = Math.min(attempts / maxAttempts, 0.9);
        onProgress?.(status, progress, `Status: ${status}`);
        if (status === 'ready') {
            return mapNetlifyDeployment(response, projectId);
        }
        if (status === 'error') {
            throw new Error(response.error_message || 'Deployment failed');
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
        attempts++;
    }
    throw new Error('Deployment timed out');
}
async function getDeployment(credentials, siteId, deployId, projectId) {
    const response = await netlifyApi(`/sites/${siteId}/deploys/${deployId}`, { token: credentials.token });
    return mapNetlifyDeployment(response, projectId);
}
async function listDeployments(credentials, siteId, options) {
    const params = new URLSearchParams();
    if (options?.limit)
        params.set('per_page', String(options.limit));
    if (options?.page)
        params.set('page', String(options.page));
    const query = params.toString();
    const endpoint = `/sites/${siteId}/deploys${query ? `?${query}` : ''}`;
    const deploys = await netlifyApi(endpoint, {
        token: credentials.token,
    });
    return deploys.map((d) => mapNetlifyDeployment(d, siteId));
}
async function deleteDeployment(credentials, deployId) {
    await netlifyApi(`/deploys/${deployId}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
async function cancelDeployment(credentials, deployId) {
    await netlifyApi(`/deploys/${deployId}/cancel`, {
        method: 'POST',
        token: credentials.token,
    });
}
async function listEnvVars(credentials, siteId) {
    return netlifyApi(`/accounts/${credentials.accountId}/env?site_id=${siteId}`, { token: credentials.token });
}
async function setEnvVar(credentials, siteId, key, value, context = 'all') {
    return netlifyApi(`/accounts/${credentials.accountId}/env/${key}?site_id=${siteId}`, {
        method: 'PATCH',
        body: {
            value,
            context,
        },
        token: credentials.token,
    });
}
async function createEnvVar(credentials, siteId, key, value) {
    return netlifyApi(`/accounts/${credentials.accountId}/env?site_id=${siteId}`, {
        method: 'POST',
        body: [
            {
                key,
                scopes: ['builds', 'functions', 'runtime', 'post_processing'],
                values: [{ value, context: 'all' }],
            },
        ],
        token: credentials.token,
    });
}
async function deleteEnvVar(credentials, siteId, key) {
    await netlifyApi(`/accounts/${credentials.accountId}/env/${key}?site_id=${siteId}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
async function listDomains(credentials, siteId) {
    const site = await getSite(credentials, siteId);
    // Netlify includes domain info in site response
    return [
        {
            id: site.id,
            hostname: new URL(site.ssl_url).hostname,
            ssl: true,
            url: site.ssl_url,
            state: 'ready',
            custom_primary: !!site.custom_domain,
        },
    ];
}
async function addDomain(credentials, siteId, domain) {
    await updateSite(credentials, siteId, { customDomain: domain });
}
// ============================================
// Rollback
// ============================================
async function rollback(credentials, siteId, deployId, projectId) {
    // Netlify rollback is done by restoring a deploy to production
    const response = await netlifyApi(`/sites/${siteId}/deploys/${deployId}/restore`, {
        method: 'POST',
        token: credentials.token,
    });
    return mapNetlifyDeployment(response, projectId);
}
async function listBuildHooks(credentials, siteId) {
    return netlifyApi(`/sites/${siteId}/build_hooks`, {
        token: credentials.token,
    });
}
async function createBuildHook(credentials, siteId, title, branch = 'main') {
    return netlifyApi(`/sites/${siteId}/build_hooks`, {
        method: 'POST',
        body: { title, branch },
        token: credentials.token,
    });
}
async function deleteBuildHook(credentials, siteId, hookId) {
    await netlifyApi(`/sites/${siteId}/build_hooks/${hookId}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
async function triggerBuildHook(hookUrl) {
    const response = await (0, node_fetch_1.default)(hookUrl, { method: 'POST' });
    if (!response.ok) {
        throw new Error(`Failed to trigger build hook: ${response.status}`);
    }
}
