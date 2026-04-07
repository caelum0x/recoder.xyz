"use strict";
/**
 * Cloudflare Workers Deployment Provider
 * Handles deployment to Cloudflare Workers via their REST API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = validateToken;
exports.verifyToken = verifyToken;
exports.listWorkers = listWorkers;
exports.getWorker = getWorker;
exports.deleteWorker = deleteWorker;
exports.deploy = deploy;
exports.listSecrets = listSecrets;
exports.deleteSecret = deleteSecret;
exports.listDomains = listDomains;
exports.addCustomDomain = addCustomDomain;
exports.listDeployments = listDeployments;
exports.getDeployment = getDeployment;
exports.rollback = rollback;
exports.getTailUrl = getTailUrl;
exports.listRoutes = listRoutes;
exports.createRoute = createRoute;
exports.deleteRoute = deleteRoute;
const node_fetch_1 = __importDefault(require("node-fetch"));
const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';
async function cloudflareApi(endpoint, options) {
    const { method = 'GET', body, token, contentType = 'application/json', rawBody } = options;
    const headers = {
        Authorization: `Bearer ${token}`,
    };
    if (contentType && !rawBody) {
        headers['Content-Type'] = contentType;
    }
    let requestBody;
    if (rawBody) {
        requestBody = rawBody;
    }
    else if (body) {
        requestBody = JSON.stringify(body);
    }
    const response = await (0, node_fetch_1.default)(`${CLOUDFLARE_API_URL}${endpoint}`, {
        method,
        headers,
        body: requestBody,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ errors: [] }));
        const errorMessage = error.errors?.[0]?.message || `Cloudflare API error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    // Some endpoints return no content
    if (response.status === 204) {
        return undefined;
    }
    const json = await response.json();
    if (!json.success) {
        const errorMessage = json.errors?.[0]?.message || 'Cloudflare API request failed';
        throw new Error(errorMessage);
    }
    return json.result;
}
async function validateToken(apiToken, accountId) {
    try {
        const account = await cloudflareApi(`/accounts/${accountId}`, { token: apiToken });
        return {
            valid: true,
            account: { name: account.name, id: account.id },
        };
    }
    catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Invalid token or account ID',
        };
    }
}
async function verifyToken(apiToken) {
    try {
        // Use the token verification endpoint
        const response = await (0, node_fetch_1.default)(`${CLOUDFLARE_API_URL}/user/tokens/verify`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
            },
        });
        const json = await response.json();
        return { valid: json.success && json.result?.status === 'active' };
    }
    catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Token verification failed',
        };
    }
}
async function listWorkers(credentials) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required for Cloudflare Workers');
    }
    const response = await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts`, { token: credentials.token });
    return response;
}
async function getWorker(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required for Cloudflare Workers');
    }
    return cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}`, { token: credentials.token });
}
async function deleteWorker(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required for Cloudflare Workers');
    }
    await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
function mapCloudflareStatus(status) {
    switch (status) {
        case 'queued':
        case 'initializing':
            return 'queued';
        case 'building':
        case 'build_complete':
            return 'building';
        case 'deploying':
            return 'deploying';
        case 'active':
        case 'success':
        case 'idle':
            return 'ready';
        case 'failure':
        case 'failed':
            return 'error';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'ready'; // Workers are typically immediately active after upload
    }
}
function mapCloudflareDeployment(workerName, deployment, accountId, projectId) {
    return {
        id: deployment.id,
        provider: 'cloudflare',
        projectId,
        providerProjectId: workerName,
        url: `https://${workerName}.${accountId}.workers.dev`,
        deploymentUrl: `https://${workerName}.${accountId}.workers.dev`,
        productionUrl: `https://${workerName}.${accountId}.workers.dev`,
        inspectorUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production`,
        status: 'ready',
        createdAt: new Date(deployment.created_on).getTime(),
        updatedAt: new Date(deployment.created_on).getTime(),
        completedAt: new Date(deployment.created_on).getTime(),
        meta: {
            source: deployment.source,
            strategy: deployment.strategy,
            author_email: deployment.author_email,
        },
    };
}
// ============================================
// Deploy
// ============================================
/**
 * Build a Worker script from project files.
 *
 * Looks for common Worker entry points and constructs a valid Worker script.
 * If the project has a wrangler.toml, it uses the configured main entry.
 * Otherwise, it looks for index.js/index.ts or src/index.js/src/index.ts.
 */
function buildWorkerScript(files) {
    // Determine the entry point
    const entryPoints = [
        'src/index.ts',
        'src/index.js',
        'src/worker.ts',
        'src/worker.js',
        'index.ts',
        'index.js',
        'worker.ts',
        'worker.js',
        '_worker.js',
    ];
    let mainScript;
    let entryFile;
    // Check wrangler.toml for main entry
    const wranglerToml = files['wrangler.toml'] || files['./wrangler.toml'];
    if (wranglerToml) {
        const mainMatch = wranglerToml.match(/main\s*=\s*"([^"]+)"/);
        if (mainMatch) {
            const configuredMain = mainMatch[1].replace(/^\.\//, '');
            if (files[configuredMain]) {
                mainScript = files[configuredMain];
                entryFile = configuredMain;
            }
        }
    }
    // Fallback to common entry points
    if (!mainScript) {
        for (const entry of entryPoints) {
            const normalizedEntry = entry.replace(/^\.\//, '');
            if (files[normalizedEntry] || files[`./${normalizedEntry}`]) {
                mainScript = files[normalizedEntry] || files[`./${normalizedEntry}`];
                entryFile = normalizedEntry;
                break;
            }
        }
    }
    // If still no entry point, try to create a simple static asset worker
    if (!mainScript) {
        // Check for an index.html to serve as a static site
        const indexHtml = files['index.html'] || files['dist/index.html'] || files['public/index.html'] || files['build/index.html'];
        if (indexHtml) {
            mainScript = `
export default {
  async fetch(request, env, ctx) {
    return new Response(${JSON.stringify(indexHtml)}, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
`.trim();
            entryFile = '_generated_worker.js';
        }
        else {
            throw new Error('No Worker entry point found. Expected one of: ' +
                entryPoints.join(', ') +
                ' or an index.html for static deployment');
        }
    }
    const metadata = {
        main_module: entryFile || 'index.js',
        compatibility_date: new Date().toISOString().split('T')[0],
    };
    return { mainScript, metadata };
}
/**
 * Upload a Worker script using the Cloudflare Workers API.
 * Uses the multipart form upload for module workers.
 */
async function uploadWorkerScript(credentials, workerName, script, metadata) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required for Cloudflare Workers');
    }
    const workerMetadata = {
        main_module: metadata.main_module || 'index.js',
        compatibility_date: metadata.compatibility_date || new Date().toISOString().split('T')[0],
        ...(metadata.compatibility_flags ? { compatibility_flags: metadata.compatibility_flags } : {}),
        ...(metadata.bindings ? { bindings: metadata.bindings } : {}),
    };
    // For module workers, use multipart form upload
    const boundary = '----CloudflareWorkerBoundary' + Date.now().toString(36);
    const mainModule = workerMetadata.main_module || 'index.js';
    let formBody = '';
    // Worker metadata part
    formBody += `--${boundary}\r\n`;
    formBody += `Content-Disposition: form-data; name="metadata"; filename="metadata.json"\r\n`;
    formBody += `Content-Type: application/json\r\n\r\n`;
    formBody += JSON.stringify(workerMetadata) + '\r\n';
    // Worker script part
    formBody += `--${boundary}\r\n`;
    formBody += `Content-Disposition: form-data; name="${mainModule}"; filename="${mainModule}"\r\n`;
    formBody += `Content-Type: application/javascript+module\r\n\r\n`;
    formBody += script + '\r\n';
    formBody += `--${boundary}--\r\n`;
    const response = await (0, node_fetch_1.default)(`${CLOUDFLARE_API_URL}/accounts/${credentials.accountId}/workers/scripts/${workerName}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formBody,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ errors: [] }));
        const errorMessage = error.errors?.[0]?.message || `Worker upload failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }
    const json = await response.json();
    if (!json.success) {
        const errorMessage = json.errors?.[0]?.message || 'Worker upload failed';
        throw new Error(errorMessage);
    }
    return json.result;
}
async function deploy(credentials, config, files, onProgress) {
    const startTime = Date.now();
    const logs = [];
    const addLog = (message, level = 'info') => {
        logs.push({
            timestamp: Date.now(),
            level,
            message,
            source: 'cloudflare',
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
        if (!credentials.accountId) {
            throw new Error('Account ID is required for Cloudflare Workers deployment');
        }
        const workerName = config.providerProjectId || config.projectName;
        addLog('Starting deployment to Cloudflare Workers...');
        reportProgress('preparing', 5, 'Preparing deployment...');
        // Build the Worker script from project files
        addLog(`Building Worker script from ${Object.keys(files).length} files...`);
        reportProgress('preparing', 15, 'Building Worker script...');
        const { mainScript, metadata } = buildWorkerScript(files);
        addLog(`Worker script built, entry: ${metadata.main_module}`);
        reportProgress('uploading', 30, 'Uploading Worker script...');
        // Upload the Worker script
        const worker = await uploadWorkerScript(credentials, workerName, mainScript, metadata);
        addLog(`Worker script uploaded: ${worker.id || workerName}`);
        reportProgress('deploying', 60, 'Activating Worker...');
        // Set environment variables if provided
        if (config.environmentVariables && Object.keys(config.environmentVariables).length > 0) {
            addLog(`Setting ${Object.keys(config.environmentVariables).length} environment variables...`);
            reportProgress('deploying', 70, 'Setting environment variables...');
            await setWorkerSecrets(credentials, workerName, config.environmentVariables);
        }
        // Set custom domain if provided
        if (config.autoAssignDomain) {
            addLog('Enabling workers.dev subdomain...');
            reportProgress('deploying', 80, 'Configuring subdomain...');
            await enableWorkersDevSubdomain(credentials, workerName);
        }
        // Fetch the deployment info
        let deploymentInfo;
        try {
            const deployments = await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/deployments`, { token: credentials.token });
            deploymentInfo = deployments.deployments?.[0];
        }
        catch {
            // Deployments API may not be available for all account types
        }
        const workerUrl = `https://${workerName}.${credentials.accountId}.workers.dev`;
        addLog(`Deployment complete: ${workerUrl}`);
        reportProgress('complete', 100, 'Deployment complete!');
        const deployment = {
            id: deploymentInfo?.id || worker.id || `${workerName}-${Date.now()}`,
            provider: 'cloudflare',
            projectId: config.projectId || workerName,
            providerProjectId: workerName,
            url: workerUrl,
            deploymentUrl: workerUrl,
            productionUrl: workerUrl,
            inspectorUrl: `https://dash.cloudflare.com/${credentials.accountId}/workers/services/view/${workerName}/production`,
            status: 'ready',
            createdAt: startTime,
            updatedAt: Date.now(),
            completedAt: Date.now(),
            buildTime: Date.now() - startTime,
            progress: {
                phase: 'complete',
                progress: 100,
                message: 'Deployment complete!',
                startedAt: startTime,
                completedAt: Date.now(),
                logs,
            },
            meta: {
                workerName,
                accountId: credentials.accountId,
            },
        };
        return deployment;
    }
    catch (error) {
        addLog(error instanceof Error ? error.message : 'Deployment failed', 'error');
        reportProgress('error', 0, error instanceof Error ? error.message : 'Deployment failed');
        throw error;
    }
}
// ============================================
// Secrets / Environment Variables
// ============================================
async function setWorkerSecrets(credentials, workerName, secrets) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    // Cloudflare Workers secrets are set individually
    for (const [key, value] of Object.entries(secrets)) {
        await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/secrets`, {
            method: 'PUT',
            body: { name: key, text: value, type: 'secret_text' },
            token: credentials.token,
        });
    }
}
async function listSecrets(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    return cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/secrets`, { token: credentials.token });
}
async function deleteSecret(credentials, workerName, secretName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/secrets/${secretName}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
// ============================================
// Subdomain / Custom Domains
// ============================================
async function enableWorkersDevSubdomain(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/subdomain`, {
        method: 'POST',
        body: { enabled: true },
        token: credentials.token,
    });
}
async function listDomains(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    return cloudflareApi(`/accounts/${credentials.accountId}/workers/domains?service=${workerName}&environment=production`, { token: credentials.token });
}
async function addCustomDomain(credentials, workerName, hostname, zoneId) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    return cloudflareApi(`/accounts/${credentials.accountId}/workers/domains`, {
        method: 'PUT',
        body: {
            hostname,
            zone_id: zoneId,
            service: workerName,
            environment: 'production',
        },
        token: credentials.token,
    });
}
// ============================================
// Deployments / Versions
// ============================================
async function listDeployments(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    try {
        const response = await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/deployments`, { token: credentials.token });
        return (response.deployments || []).map((d) => mapCloudflareDeployment(workerName, d, credentials.accountId, workerName));
    }
    catch {
        // Deployments API may not be available, return empty list
        return [];
    }
}
async function getDeployment(credentials, workerName, deploymentId, projectId) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    const deployments = await listDeployments(credentials, workerName);
    const deployment = deployments.find((d) => d.id === deploymentId);
    if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
    }
    return deployment;
}
// ============================================
// Rollback
// ============================================
async function rollback(credentials, workerName, versionId, projectId) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    // Cloudflare Workers rollback is done by deploying a specific version
    const response = await cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/deployments`, {
        method: 'POST',
        body: {
            strategy: 'percentage',
            versions: [
                {
                    version_id: versionId,
                    percentage: 100,
                },
            ],
        },
        token: credentials.token,
    });
    return mapCloudflareDeployment(workerName, response, credentials.accountId, projectId);
}
// ============================================
// Tail / Logs
// ============================================
async function getTailUrl(credentials, workerName) {
    if (!credentials.accountId) {
        throw new Error('Account ID is required');
    }
    return cloudflareApi(`/accounts/${credentials.accountId}/workers/scripts/${workerName}/tails`, {
        method: 'POST',
        body: {},
        token: credentials.token,
    });
}
async function listRoutes(credentials, zoneId) {
    return cloudflareApi(`/zones/${zoneId}/workers/routes`, { token: credentials.token });
}
async function createRoute(credentials, zoneId, pattern, workerName) {
    return cloudflareApi(`/zones/${zoneId}/workers/routes`, {
        method: 'POST',
        body: { pattern, script: workerName },
        token: credentials.token,
    });
}
async function deleteRoute(credentials, zoneId, routeId) {
    await cloudflareApi(`/zones/${zoneId}/workers/routes/${routeId}`, {
        method: 'DELETE',
        token: credentials.token,
    });
}
