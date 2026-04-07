"use strict";
/**
 * OpenClaw Platform Hub
 *
 * Forwards OpenClaw events (WhatsApp, Telegram, Teams messages) to
 * PM and Agency apps via their webhook/API endpoints.
 *
 * Architecture:
 *   OpenClaw Gateway → A2A OpenClaw Adapter → Platform Hub → PM / Agency
 *
 * When a message arrives from a social channel (WhatsApp, Telegram, etc.),
 * OpenClaw creates a task envelope. This hub listens for those events and
 * forwards them to the appropriate platform:
 *
 * - Client messages → Agency (client delivery workflows)
 * - Project updates → PM (task tracking, feedback)
 * - General inquiries → Agents backend (AI response)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processOpenClawEvent = processOpenClawEvent;
exports.previewRouting = previewRouting;
exports.getHubHealth = getHubHealth;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('openclaw-platform-hub');
// ── Configuration ──
const PM_URL = process.env.RECODER_PM_URL || 'http://host.docker.internal:3004';
const AGENCY_URL = process.env.RECODER_AGENCY_URL || 'http://host.docker.internal:3007';
const AGENTS_BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://host.docker.internal:8000';
// ── Routing Logic ──
/**
 * Determine which platform(s) should receive this event.
 * Returns one or more targets based on message content and context.
 */
function routeEvent(event) {
    const content = (event.content || '').toLowerCase();
    const targets = [];
    // Client-related keywords → Agency
    const agencyKeywords = [
        'deliverable', 'deadline', 'invoice', 'quote', 'proposal',
        'brief', 'project update', 'client', 'milestone', 'sow',
        'scope', 'revision', 'approval', 'feedback on deliverable',
    ];
    if (agencyKeywords.some((k) => content.includes(k))) {
        targets.push('agency');
    }
    // PM-related keywords → PM
    const pmKeywords = [
        'task', 'ticket', 'sprint', 'backlog', 'priority',
        'feature request', 'bug report', 'release', 'changelog',
        'roadmap', 'initiative', 'insight', 'metric',
    ];
    if (pmKeywords.some((k) => content.includes(k))) {
        targets.push('pm');
    }
    // Default: if no specific routing, send to agents for AI response
    if (targets.length === 0) {
        targets.push('agents');
    }
    return targets;
}
// ── Forwarding ──
/**
 * Forward an event to a specific platform.
 */
async function forwardToTarget(target, event) {
    const urls = {
        pm: `${PM_URL}/api/webhooks/openclaw`,
        agency: `${AGENCY_URL}/api/webhooks/openclaw`,
        agents: `${AGENTS_BACKEND_URL}/v1/openclaw/message`,
    };
    const url = urls[target];
    if (!url) {
        return { target, success: false, error: 'Unknown target' };
    }
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-OpenClaw-Channel': event.channel,
                'X-OpenClaw-Event': event.type,
            },
            body: JSON.stringify({
                type: event.type,
                channel: event.channel,
                from: event.from,
                content: event.content,
                media: event.media,
                metadata: event.metadata,
                timestamp: event.timestamp,
                threadId: event.threadId,
            }),
            signal: AbortSignal.timeout(10000),
        });
        logger.info({ target, status: response.status, channel: event.channel }, 'Forwarded OpenClaw event');
        return {
            target,
            success: response.ok,
            statusCode: response.status,
        };
    }
    catch (err) {
        logger.warn({ target, error: err.message, channel: event.channel }, 'Failed to forward OpenClaw event');
        return {
            target,
            success: false,
            error: err.message,
        };
    }
}
// ── Public API ──
/**
 * Process an OpenClaw event: route and forward to appropriate platforms.
 * Called by the A2A OpenClaw adapter when it receives a chat.message event.
 */
async function processOpenClawEvent(event) {
    if (event.type !== 'chat.message') {
        logger.debug({ type: event.type }, 'Skipping non-message event');
        return [];
    }
    const targets = routeEvent(event);
    logger.info({ channel: event.channel, from: event.from.id, targets }, 'Routing OpenClaw event');
    // Forward to all targets in parallel
    const results = await Promise.all(targets.map((target) => forwardToTarget(target, event)));
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    logger.info({ succeeded, failed, targets }, 'OpenClaw event processing complete');
    return results;
}
/**
 * Get the routing decision for an event without forwarding.
 * Useful for debugging and testing.
 */
function previewRouting(event) {
    return routeEvent(event);
}
/**
 * Get hub health status.
 */
async function getHubHealth() {
    const check = async (url) => {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            return response.ok;
        }
        catch {
            return false;
        }
    };
    const [pm, agency, agents] = await Promise.all([
        check(`${PM_URL}/api/health`),
        check(`${AGENCY_URL}/api/health`),
        check(`${AGENTS_BACKEND_URL}/v1/health`),
    ]);
    return { pm, agency, agents };
}
