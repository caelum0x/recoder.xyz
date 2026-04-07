"use strict";
/**
 * Secrets Manager Service
 * Handles encrypted environment variable management
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretsManager = void 0;
exports.getSecrets = getSecrets;
exports.setSecret = setSecret;
exports.deleteSecret = deleteSecret;
exports.exportSecretsToEnv = exportSecretsToEnv;
const dockerode_1 = __importDefault(require("dockerode"));
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
const docker = new dockerode_1.default();
// ============================================
// Security: Input Validation Constants
// ============================================
// Only these environment names are allowed (prevents path traversal)
const VALID_ENVIRONMENTS = ['development', 'production', 'test', 'local'];
// Limits to prevent abuse
const MAX_KEY_LENGTH = 256;
const MAX_VALUE_LENGTH = 65536; // 64KB max for a single env var
const MAX_SECRETS_PER_FILE = 500;
function isValidEnvironment(env) {
    return VALID_ENVIRONMENTS.includes(env);
}
function validateSecretKey(key) {
    if (!key || typeof key !== 'string') {
        return { valid: false, error: 'Key is required' };
    }
    const trimmed = key.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Key cannot be empty' };
    }
    if (trimmed.length > MAX_KEY_LENGTH) {
        return { valid: false, error: `Key too long (max ${MAX_KEY_LENGTH} chars)` };
    }
    // Sanitize: only allow alphanumeric and underscore, convert to uppercase
    const sanitized = trimmed.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    if (!sanitized || sanitized.length === 0) {
        return { valid: false, error: 'Key contains no valid characters' };
    }
    // Key must start with a letter or underscore (not a number)
    if (/^[0-9]/.test(sanitized)) {
        return { valid: false, error: 'Key cannot start with a number' };
    }
    return { valid: true, sanitized };
}
function validateSecretValue(value) {
    if (value === undefined || value === null) {
        return { valid: false, error: 'Value is required' };
    }
    // Allow empty string as a valid value
    if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string' };
    }
    if (value.length > MAX_VALUE_LENGTH) {
        return { valid: false, error: `Value too long (max ${MAX_VALUE_LENGTH} chars)` };
    }
    return { valid: true };
}
// ============================================
// Execute command in container
// ============================================
async function execInContainer(containerId, cmd) {
    // Daytona sandboxes use SDK exec, not Docker exec
    if (global.__daytonaSandboxIds?.has(containerId)) {
        const result = await (0, daytona_file_ops_js_1.daytonaExec)(containerId, cmd, { timeoutSecs: 30 });
        return (result.output || '').trim();
    }
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', cmd],
        AttachStdout: true,
        AttachStderr: true,
    });
    const stream = await exec.start({});
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
            const raw = Buffer.concat(chunks);
            let result = '';
            let i = 0;
            while (i < raw.length) {
                if (i + 8 <= raw.length) {
                    const size = raw.readUInt32BE(i + 4);
                    if (i + 8 + size <= raw.length) {
                        result += raw.slice(i + 8, i + 8 + size).toString();
                        i += 8 + size;
                        continue;
                    }
                }
                result += raw.slice(i).toString();
                break;
            }
            resolve(result.trim());
        });
        stream.on('error', reject);
    });
}
// ============================================
// Get env file path for environment
// ============================================
function getEnvFilePath(environment) {
    switch (environment) {
        case 'production':
            return '/workspace/.env.production';
        case 'test':
            return '/workspace/.env.test';
        case 'local':
            return '/workspace/.env.local';
        default:
            return '/workspace/.env';
    }
}
// ============================================
// Get Secrets
// ============================================
async function getSecrets(containerId, environment) {
    // SECURITY: Validate environment parameter
    if (!isValidEnvironment(environment)) {
        console.warn(`[SecretsManager] Rejected invalid environment: ${environment}`);
        return [];
    }
    try {
        const envFile = getEnvFilePath(environment);
        const content = await execInContainer(containerId, `cat "${envFile}" 2>/dev/null || echo ""`);
        if (!content) {
            return [];
        }
        const secrets = [];
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            // Parse KEY=VALUE
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();
                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                secrets.push({
                    key,
                    value,
                    masked: true,
                    environment: environment,
                });
                // SECURITY: Limit number of secrets returned
                if (secrets.length >= MAX_SECRETS_PER_FILE) {
                    console.warn(`[SecretsManager] Reached max secrets limit (${MAX_SECRETS_PER_FILE})`);
                    break;
                }
            }
        }
        return secrets;
    }
    catch (error) {
        console.error(`[SecretsManager] Error reading secrets:`, error);
        return [];
    }
}
// ============================================
// Set Secret
// ============================================
async function setSecret(containerId, key, value, environment) {
    // SECURITY: Validate environment parameter
    if (!isValidEnvironment(environment)) {
        console.warn(`[SecretsManager] Rejected invalid environment: ${environment}`);
        return { success: false, error: 'Invalid environment. Must be: development, production, test, or local' };
    }
    // SECURITY: Validate key
    const keyValidation = validateSecretKey(key);
    if (!keyValidation.valid || !keyValidation.sanitized) {
        console.warn(`[SecretsManager] Rejected invalid key: ${key}`);
        return { success: false, error: keyValidation.error || 'Invalid key' };
    }
    const safeKey = keyValidation.sanitized;
    // SECURITY: Validate value
    const valueValidation = validateSecretValue(value);
    if (!valueValidation.valid) {
        console.warn(`[SecretsManager] Rejected invalid value for key: ${safeKey}`);
        return { success: false, error: valueValidation.error || 'Invalid value' };
    }
    try {
        const envFile = getEnvFilePath(environment);
        // Check if key already exists and count total secrets
        const existingContent = await execInContainer(containerId, `cat "${envFile}" 2>/dev/null || echo ""`);
        const lines = existingContent.split('\n');
        let found = false;
        const newLines = [];
        let secretCount = 0;
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments for counting
            if (trimmed && !trimmed.startsWith('#')) {
                secretCount++;
            }
            if (trimmed.startsWith(`${safeKey}=`)) {
                // Replace existing key (don't increment count as we're replacing)
                newLines.push(`${safeKey}=${escapeEnvValue(value)}`);
                found = true;
                secretCount--; // Will be replaced, not added
            }
            else {
                newLines.push(line);
            }
        }
        // SECURITY: Check secrets limit before adding new one
        if (!found && secretCount >= MAX_SECRETS_PER_FILE) {
            return { success: false, error: `Maximum secrets limit reached (${MAX_SECRETS_PER_FILE})` };
        }
        if (!found) {
            // Add new key
            newLines.push(`${safeKey}=${escapeEnvValue(value)}`);
        }
        // Write back to file using safe base64 encoding
        const newContent = newLines.filter(l => l.trim()).join('\n');
        const b64Content = Buffer.from(newContent + '\n').toString('base64');
        await execInContainer(containerId, `echo '${b64Content}' | base64 -d > "${envFile}"`);
        console.log(`[SecretsManager] Set ${safeKey} in ${envFile}`);
        return { success: true };
    }
    catch (error) {
        console.error(`[SecretsManager] Error setting secret:`, error);
        return { success: false, error: error.message };
    }
}
/**
 * Properly escape value for .env file format
 * Uses quotes if value contains special characters
 */
function escapeEnvValue(value) {
    // If value contains special chars that could cause issues, wrap in quotes
    if (/[\s'"\\$`!#&*()[\]{}|;<>?]/.test(value) || value.length === 0) {
        // Use double quotes and escape internal double quotes and backslashes
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}"`;
    }
    return value;
}
// ============================================
// Delete Secret
// ============================================
async function deleteSecret(containerId, key, environment) {
    // SECURITY: Validate environment parameter
    if (!isValidEnvironment(environment)) {
        console.warn(`[SecretsManager] Rejected invalid environment: ${environment}`);
        return { success: false, error: 'Invalid environment. Must be: development, production, test, or local' };
    }
    // SECURITY: Validate key
    const keyValidation = validateSecretKey(key);
    if (!keyValidation.valid || !keyValidation.sanitized) {
        console.warn(`[SecretsManager] Rejected invalid key for deletion: ${key}`);
        return { success: false, error: keyValidation.error || 'Invalid key' };
    }
    const safeKey = keyValidation.sanitized;
    try {
        const envFile = getEnvFilePath(environment);
        const existingContent = await execInContainer(containerId, `cat "${envFile}" 2>/dev/null || echo ""`);
        const lines = existingContent.split('\n');
        const newLines = [];
        let found = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(`${safeKey}=`)) {
                found = true;
                // Skip this line (delete it)
            }
            else {
                newLines.push(line);
            }
        }
        if (!found) {
            return { success: false, error: `Secret '${safeKey}' not found` };
        }
        // Write back to file
        const newContent = newLines.filter(l => l.trim()).join('\n');
        if (newContent) {
            const b64Content = Buffer.from(newContent + '\n').toString('base64');
            await execInContainer(containerId, `echo '${b64Content}' | base64 -d > "${envFile}"`);
        }
        else {
            // Remove empty file
            await execInContainer(containerId, `rm -f "${envFile}"`);
        }
        console.log(`[SecretsManager] Deleted ${safeKey} from ${envFile}`);
        return { success: true };
    }
    catch (error) {
        console.error(`[SecretsManager] Error deleting secret:`, error);
        return { success: false, error: error.message };
    }
}
// ============================================
// Export for injection into container environment
// ============================================
async function exportSecretsToEnv(containerId, environment) {
    try {
        const secrets = await getSecrets(containerId, environment);
        return secrets.map((s) => `${s.key}=${s.value}`);
    }
    catch (error) {
        console.error(`[SecretsManager] Error exporting secrets:`, error);
        return [];
    }
}
exports.secretsManager = {
    getSecrets,
    setSecret,
    deleteSecret,
    exportSecretsToEnv,
};
