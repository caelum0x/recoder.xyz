"use strict";
/**
 * @module autonomous-routing.service
 *
 * Autonomous inter-agent communication via @mention routing.
 *
 * Parses handoff/delegate/review intent from @mentions in channel messages,
 * validates target agent capabilities, and orchestrates delegation + context
 * transfer using existing services.
 *
 * Wires into `CollaborationService.onMention()` callback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousRoutingService = void 0;
exports.getAutonomousRoutingService = getAutonomousRoutingService;
exports.resetAutonomousRoutingService = resetAutonomousRoutingService;
exports.wireAutonomousRouting = wireAutonomousRouting;
const uuid_1 = require("uuid");
const delegation_chain_service_1 = require("./delegation-chain.service");
const context_bridge_service_1 = require("./context-bridge.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const collaboration_service_1 = require("./collaboration.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const approval_gate_service_1 = require("./approval-gate.service");
const workspace_service_1 = require("./workspace.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-autonomous-routing');
const INTENT_PREFIXES = {
    'handoff:': 'handoff',
    'delegate:': 'delegate',
    'review:': 'review',
};
function parseIntent(text, mentionedAgentIds) {
    if (mentionedAgentIds.length === 0)
        return null;
    const targetAgentId = mentionedAgentIds[0];
    // Find intent prefix after the @mention
    const mentionPattern = new RegExp(`@${targetAgentId}\\s*`, 'i');
    const afterMention = text.replace(mentionPattern, '').trim();
    for (const [prefix, type] of Object.entries(INTENT_PREFIXES)) {
        if (afterMention.toLowerCase().startsWith(prefix)) {
            return {
                type,
                targetAgentId,
                prompt: afterMention.slice(prefix.length).trim(),
            };
        }
    }
    // Default: treat as a regular message (no delegation)
    return {
        type: 'message',
        targetAgentId,
        prompt: afterMention,
    };
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class AutonomousRoutingService {
    findLatestSourceTask(senderAgentId, threadId) {
        const taskLifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        if (threadId) {
            const inThread = taskLifecycle.list({
                thread_id: threadId,
                assignee_agent_id: senderAgentId,
                limit: 1,
            });
            if (inThread.length > 0) {
                return { id: inThread[0].id, state: inThread[0].state };
            }
        }
        const latest = taskLifecycle.list({ assignee_agent_id: senderAgentId, limit: 1 });
        if (latest.length > 0) {
            return { id: latest[0].id, state: latest[0].state };
        }
        return null;
    }
    /**
     * Process a @mention from the collaboration service.
     * Called via `CollaborationService.onMention()` callback.
     */
    async processHandoff(event) {
        const { message, channelId, mentionedAgentIds } = event;
        const intent = parseIntent(message.text, mentionedAgentIds);
        if (!intent || intent.type === 'message') {
            logger.debug({ channelId, mentionedAgentIds }, 'mention without delegation intent, skipping');
            return;
        }
        logger.info({ intent: intent.type, from: message.senderAgentId, to: intent.targetAgentId }, 'processing autonomous handoff');
        const now = new Date().toISOString();
        const bus = (0, a2a_event_bus_1.getA2AEventBus)();
        // Check if workspace requires approval
        const ws = this.findWorkspaceForChannel(channelId);
        if (ws?.settings.approvalRequired) {
            const approvalGate = (0, approval_gate_service_1.getApprovalGateService)();
            const sourceTask = this.findLatestSourceTask(message.senderAgentId, message.threadId);
            const approval = approvalGate.createRequest({
                workspaceId: ws.workspaceId,
                requestingAgentId: message.senderAgentId,
                targetAgentId: intent.targetAgentId,
                action: intent.type,
                details: {
                    prompt: intent.prompt,
                    channelId,
                    threadId: message.threadId,
                    sourceTaskId: sourceTask?.id || '',
                    handoffType: intent.type,
                },
                timeoutMs: 300_000, // 5 minutes
            });
            if (sourceTask) {
                const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                if (sourceTask.state !== 'input-required') {
                    lifecycle.requestInput(sourceTask.id, `Awaiting approval for ${intent.type} to @${intent.targetAgentId}`, 'approval-gate');
                }
                lifecycle.updateTaskMetadata(sourceTask.id, {
                    metadataPatch: {
                        approval: {
                            approvalId: approval.approvalId,
                            status: approval.status,
                            action: intent.type,
                            targetAgentId: intent.targetAgentId,
                        },
                        handoff: {
                            status: 'awaiting-approval',
                            targetAgentId: intent.targetAgentId,
                            channelId,
                            threadId: message.threadId,
                        },
                    },
                    triggeredBy: 'approval-gate',
                    reason: 'Delegation approval requested',
                });
            }
            approvalGate.onResolved(approval.approvalId, (resolved) => {
                const resolvedTaskId = typeof resolved.details.sourceTaskId === 'string' && resolved.details.sourceTaskId
                    ? resolved.details.sourceTaskId
                    : sourceTask?.id;
                if (resolvedTaskId) {
                    const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                    lifecycle.updateTaskMetadata(resolvedTaskId, {
                        metadataPatch: {
                            approval: {
                                approvalId: resolved.approvalId,
                                status: resolved.status,
                                resolvedAt: resolved.resolvedAt,
                                resolvedBy: resolved.resolvedBy,
                                action: resolved.action,
                                targetAgentId: resolved.targetAgentId,
                            },
                            handoff: {
                                status: resolved.status === 'granted' ? 'approved' : resolved.status,
                                targetAgentId: resolved.targetAgentId,
                                channelId,
                                threadId: message.threadId,
                            },
                        },
                        triggeredBy: 'approval-gate',
                        reason: `Delegation approval ${resolved.status}`,
                    });
                    if (resolved.status === 'granted') {
                        const currentTask = lifecycle.getTask(resolvedTaskId);
                        if (currentTask.ok && currentTask.data.state === 'input-required') {
                            lifecycle.startTask(resolvedTaskId, 'approval-gate');
                        }
                    }
                }
                if (resolved.status === 'granted') {
                    void this.executeDelegation(intent, message.senderAgentId, channelId, {
                        sourceTaskId: resolvedTaskId,
                        approvalId: resolved.approvalId,
                    }).catch((err) => {
                        logger.error({ err, approvalId: resolved.approvalId }, 'approved delegation failed to execute');
                        if (resolvedTaskId) {
                            (0, task_lifecycle_service_1.getTaskLifecycleService)().updateTaskMetadata(resolvedTaskId, {
                                metadataPatch: {
                                    handoff: {
                                        status: 'failed',
                                        targetAgentId: intent.targetAgentId,
                                        channelId,
                                        threadId: message.threadId,
                                        approvalId: resolved.approvalId,
                                        error: err instanceof Error ? err.message : String(err),
                                    },
                                },
                                triggeredBy: 'approval-gate',
                                reason: 'Approved delegation failed to execute',
                            });
                        }
                    });
                }
            });
            // Post approval request in channel
            try {
                (0, collaboration_service_1.getCollaborationSvc)().sendMessage({
                    threadId: message.threadId,
                    senderAgentId: 'system',
                    text: `Approval required: ${message.senderAgentId} wants to ${intent.type} to @${intent.targetAgentId}. Approve or reject.`,
                });
            }
            catch { /* ignore */ }
            bus.publish({
                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                type: a2a_event_bus_1.A2AEventType.ApprovalRequested,
                timestamp: now,
                data: { approval },
                channelId,
                workspaceId: ws.workspaceId,
            });
            logger.info({ approvalId: approval.approvalId }, 'awaiting approval for handoff');
            return;
        }
        // Execute delegation directly
        await this.executeDelegation(intent, message.senderAgentId, channelId);
    }
    /**
     * Execute a delegation after approval (or directly if no approval needed).
     */
    async executeDelegation(intent, fromAgentId, channelId, context) {
        const now = new Date().toISOString();
        const bus = (0, a2a_event_bus_1.getA2AEventBus)();
        const workspace = this.findWorkspaceForChannel(channelId);
        // Publish handoff initiated event
        bus.publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.HandoffInitiated,
            timestamp: now,
            data: {
                from: fromAgentId,
                to: intent.targetAgentId,
                intent: intent.type,
                prompt: intent.prompt,
            },
            channelId,
        });
        try {
            // Create delegation via delegation chain service
            const delegationChain = (0, delegation_chain_service_1.getDelegationChainService)();
            const delegation = delegationChain.delegate({
                fromAgentId,
                toAgentId: intent.targetAgentId,
                prompt: intent.prompt,
                priority: 'normal',
                metadata: {
                    channelId,
                    ...(workspace ? { workspaceId: workspace.workspaceId, projectId: workspace.projectId } : {}),
                    intent: intent.type,
                    ...(context?.sourceTaskId ? { sourceTaskId: context.sourceTaskId } : {}),
                    ...(context?.approvalId ? { approvalId: context.approvalId } : {}),
                },
            });
            if (context?.sourceTaskId) {
                (0, task_lifecycle_service_1.getTaskLifecycleService)().updateTaskMetadata(context.sourceTaskId, {
                    metadataPatch: {
                        handoff: {
                            status: 'delegated',
                            delegationId: delegation.delegationId,
                            targetAgentId: intent.targetAgentId,
                            channelId,
                            ...(context.approvalId ? { approvalId: context.approvalId } : {}),
                        },
                    },
                    triggeredBy: fromAgentId,
                    reason: 'Delegation created',
                });
            }
            // Transfer context
            try {
                const contextBridge = (0, context_bridge_service_1.getContextBridgeService)();
                // Find a task from the source agent to transfer context from
                const taskLifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                const sourceTasks = taskLifecycle.list({ assignee_agent_id: fromAgentId, limit: 1 });
                if (sourceTasks.length > 0) {
                    const delegationTask = taskLifecycle.createTask({
                        prompt: intent.prompt,
                        assignee_agent_id: intent.targetAgentId,
                        metadata: {
                            delegationId: delegation.delegationId,
                            handoffFromAgentId: fromAgentId,
                            handoffToAgentId: intent.targetAgentId,
                            handoffChannelId: channelId,
                            ...(context?.sourceTaskId ? { handoffSourceTaskId: context.sourceTaskId } : {}),
                            ...(context?.approvalId ? { approvalId: context.approvalId } : {}),
                        },
                    });
                    await contextBridge.transferContext(sourceTasks[0].id, delegationTask.id);
                }
            }
            catch (err) {
                logger.warn({ err }, 'context transfer failed, delegation continues without context');
            }
            // Post confirmation in channel
            try {
                const collab = (0, collaboration_service_1.getCollaborationSvc)();
                const channel = collab.getChannel(channelId);
                if (channel) {
                    const threads = collab.listThreads(channelId);
                    const threadId = threads.length > 0 ? threads[threads.length - 1].id : undefined;
                    if (threadId) {
                        collab.sendMessage({
                            threadId,
                            senderAgentId: 'system',
                            text: `${intent.type} from ${fromAgentId} → @${intent.targetAgentId}: "${intent.prompt.slice(0, 100)}"`,
                        });
                    }
                }
            }
            catch { /* ignore */ }
            // Publish handoff completed
            bus.publish({
                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                type: a2a_event_bus_1.A2AEventType.HandoffCompleted,
                timestamp: new Date().toISOString(),
                data: {
                    delegationId: delegation.delegationId,
                    from: fromAgentId,
                    to: intent.targetAgentId,
                },
                channelId,
            });
            logger.info({ delegationId: delegation.delegationId, from: fromAgentId, to: intent.targetAgentId }, 'handoff completed');
        }
        catch (err) {
            logger.error({ err }, 'delegation failed');
        }
    }
    findWorkspaceForChannel(channelId) {
        const wsSvc = (0, workspace_service_1.getWorkspaceService)();
        const allWs = wsSvc.list();
        return allWs.find((ws) => ws.defaultChannelId === channelId);
    }
}
exports.AutonomousRoutingService = AutonomousRoutingService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getAutonomousRoutingService() {
    if (!_instance) {
        _instance = new AutonomousRoutingService();
    }
    return _instance;
}
function resetAutonomousRoutingService() {
    _instance = null;
}
// ---------------------------------------------------------------------------
// Wire into collaboration service
// ---------------------------------------------------------------------------
/**
 * Connect autonomous routing to the collaboration service's mention callback.
 * Call this during server startup.
 */
function wireAutonomousRouting() {
    const collab = (0, collaboration_service_1.getCollaborationSvc)();
    const router = getAutonomousRoutingService();
    collab.onMention((event) => {
        router.processHandoff(event).catch((err) => {
            logger.error({ err }, 'autonomous routing error');
        });
    });
    logger.info('autonomous routing wired to collaboration service');
}
