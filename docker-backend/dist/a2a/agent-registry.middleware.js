"use strict";
/**
 * @module agent-registry.middleware
 *
 * Express middleware for validating Agent Registry REST API requests.
 *
 * Provides validation for:
 * - POST /agents (register)
 * - POST /agents/self-register
 * - GET /agents (discovery query params)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRegisterBody = validateRegisterBody;
exports.validateSelfRegisterBody = validateSelfRegisterBody;
exports.validateDiscoveryQuery = validateDiscoveryQuery;
exports.parseJsonTextBody = parseJsonTextBody;
const a2a_1 = require("@recoder/shared/a2a");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-agent-registry-middleware');
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = new Set([
    'codex',
    'claude_code',
    'recoder_web',
    'recoder_pm',
    'recoder_agency',
    'recoder_backend',
    'recoder_desktop',
    'custom',
]);
const VALID_PROTOCOLS = new Set([
    'a2a',
    'mcp',
    'jsonrpc',
    'rest',
    'file_git',
]);
const VALID_TIERS = new Set(['tier1', 'tier2']);
const VALID_STATUSES = new Set(['supported', 'experimental', 'backlog']);
// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function sendValidationError(res, issues) {
    res.status(400).json({
        success: false,
        error: (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }),
    });
}
// ---------------------------------------------------------------------------
// Validate register body: POST /agents
// ---------------------------------------------------------------------------
/**
 * Validates the request body for agent registration.
 *
 * Required:
 * - identity: { id: string, name: string, platform: RecoderAgentPlatform }
 * - card: { name, description, version, url, skills, capabilities }
 * - protocol: A2AProtocolKind
 * - tier: ConnectorTier
 * - tags: string[]
 */
function validateRegisterBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendValidationError(res, ['Request body must be a JSON object']);
        return;
    }
    const issues = [];
    // identity
    if (!body.identity || typeof body.identity !== 'object') {
        issues.push('identity must be an object');
    }
    else {
        if (!body.identity.id || typeof body.identity.id !== 'string') {
            issues.push('identity.id must be a non-empty string');
        }
        if (!body.identity.name || typeof body.identity.name !== 'string') {
            issues.push('identity.name must be a non-empty string');
        }
        if (!body.identity.platform || !VALID_PLATFORMS.has(body.identity.platform)) {
            issues.push(`identity.platform must be one of: ${Array.from(VALID_PLATFORMS).join(', ')}`);
        }
    }
    // card
    if (!body.card || typeof body.card !== 'object') {
        issues.push('card must be an object');
    }
    else {
        if (!body.card.name || typeof body.card.name !== 'string') {
            issues.push('card.name must be a non-empty string');
        }
        if (!body.card.description || typeof body.card.description !== 'string') {
            issues.push('card.description must be a non-empty string');
        }
        if (!body.card.version || typeof body.card.version !== 'string') {
            issues.push('card.version must be a non-empty string');
        }
        if (body.card.url !== undefined && typeof body.card.url !== 'string') {
            issues.push('card.url must be a string when provided');
        }
        if (!Array.isArray(body.card.skills)) {
            issues.push('card.skills must be an array');
        }
        if (!body.card.capabilities || typeof body.card.capabilities !== 'object') {
            issues.push('card.capabilities must be an object');
        }
    }
    // protocol
    if (!body.protocol || !VALID_PROTOCOLS.has(body.protocol)) {
        issues.push(`protocol must be one of: ${Array.from(VALID_PROTOCOLS).join(', ')}`);
    }
    // tier
    if (!body.tier || !VALID_TIERS.has(body.tier)) {
        issues.push(`tier must be one of: ${Array.from(VALID_TIERS).join(', ')}`);
    }
    // tags
    if (!Array.isArray(body.tags)) {
        issues.push('tags must be an array of strings');
    }
    else if (body.tags.some((t) => typeof t !== 'string')) {
        issues.push('tags must contain only strings');
    }
    if (issues.length > 0) {
        sendValidationError(res, issues);
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate self-register body: POST /agents/self-register
// ---------------------------------------------------------------------------
/**
 * Validates the request body for self-registration.
 *
 * Required:
 * - agentId: string
 * - name: string
 * - platform: RecoderAgentPlatform
 *
 * Optional:
 * - url: string
 * - description: string
 * - version: string
 * - tags: string[]
 * - skills: RecoderAgentSkill[]
 */
function validateSelfRegisterBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendValidationError(res, ['Request body must be a JSON object']);
        return;
    }
    const issues = [];
    if (!body.agentId || typeof body.agentId !== 'string') {
        issues.push('agentId must be a non-empty string');
    }
    if (!body.name || typeof body.name !== 'string') {
        issues.push('name must be a non-empty string');
    }
    if (!body.platform || !VALID_PLATFORMS.has(body.platform)) {
        issues.push(`platform must be one of: ${Array.from(VALID_PLATFORMS).join(', ')}`);
    }
    // Optional fields type checks
    if (body.url !== undefined && typeof body.url !== 'string') {
        issues.push('url must be a string when provided');
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
        issues.push('description must be a string when provided');
    }
    if (body.version !== undefined && typeof body.version !== 'string') {
        issues.push('version must be a string when provided');
    }
    if (body.tags !== undefined) {
        if (!Array.isArray(body.tags)) {
            issues.push('tags must be an array of strings when provided');
        }
        else if (body.tags.some((t) => typeof t !== 'string')) {
            issues.push('tags must contain only strings');
        }
    }
    if (body.skills !== undefined) {
        if (!Array.isArray(body.skills)) {
            issues.push('skills must be an array when provided');
        }
        else {
            body.skills.forEach((skill, i) => {
                if (!skill || typeof skill !== 'object') {
                    issues.push(`skills[${i}] must be an object`);
                }
                else {
                    const s = skill;
                    if (!s.id || typeof s.id !== 'string')
                        issues.push(`skills[${i}].id must be a non-empty string`);
                    if (!s.name || typeof s.name !== 'string')
                        issues.push(`skills[${i}].name must be a non-empty string`);
                    if (!s.description || typeof s.description !== 'string')
                        issues.push(`skills[${i}].description must be a non-empty string`);
                    if (!Array.isArray(s.tags))
                        issues.push(`skills[${i}].tags must be an array`);
                }
            });
        }
    }
    if (issues.length > 0) {
        sendValidationError(res, issues);
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate discovery query: GET /agents
// ---------------------------------------------------------------------------
/**
 * Validates query parameters for agent discovery.
 *
 * Optional query params:
 * - protocol: A2AProtocolKind
 * - platform: RecoderAgentPlatform
 * - tier: ConnectorTier
 * - status: ConnectorStatus
 * - skillTag: string
 */
function validateDiscoveryQuery(req, res, next) {
    const issues = [];
    if (req.query.protocol !== undefined) {
        if (typeof req.query.protocol !== 'string' || !VALID_PROTOCOLS.has(req.query.protocol)) {
            issues.push(`protocol must be one of: ${Array.from(VALID_PROTOCOLS).join(', ')}`);
        }
    }
    if (req.query.platform !== undefined) {
        if (typeof req.query.platform !== 'string' || !VALID_PLATFORMS.has(req.query.platform)) {
            issues.push(`platform must be one of: ${Array.from(VALID_PLATFORMS).join(', ')}`);
        }
    }
    if (req.query.tier !== undefined) {
        if (typeof req.query.tier !== 'string' || !VALID_TIERS.has(req.query.tier)) {
            issues.push(`tier must be one of: ${Array.from(VALID_TIERS).join(', ')}`);
        }
    }
    if (req.query.status !== undefined) {
        if (typeof req.query.status !== 'string' || !VALID_STATUSES.has(req.query.status)) {
            issues.push(`status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`);
        }
    }
    if (req.query.skillTag !== undefined) {
        if (typeof req.query.skillTag !== 'string' || req.query.skillTag.trim().length === 0) {
            issues.push('skillTag must be a non-empty string');
        }
    }
    if (issues.length > 0) {
        sendValidationError(res, issues);
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Parse JSON text body (for routes behind text middleware)
// ---------------------------------------------------------------------------
/**
 * Parses string body back to JSON when the route is mounted behind
 * `express.text()` middleware.
 */
function parseJsonTextBody(req, res, next) {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            res.status(400).json({
                success: false,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidPayload,
                    message: 'Request body is not valid JSON',
                }),
            });
            return;
        }
    }
    next();
}
