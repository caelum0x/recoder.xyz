"use strict";
/**
 * @module patterns/direct-handoff
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectHandoffPattern = void 0;
const task_lifecycle_service_1 = require("../task-lifecycle.service");
const context_bridge_service_1 = require("../context-bridge.service");
const collaboration_service_1 = require("../collaboration.service");
class DirectHandoffPattern {
    patternType = 'direct-handoff';
    async execute(config, input) {
        if (input.kind !== 'direct-handoff') {
            return { success: false, patternType: this.patternType, taskIds: [], error: 'Invalid input kind' };
        }
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const contextBridge = (0, context_bridge_service_1.getContextBridgeService)();
        const taskIds = [];
        const channelId = this.ensureChannel(config, [config.requester, input.agentA, input.agentB]);
        const threadId = this.ensureThread(channelId);
        try {
            const taskA = lifecycle.createTask({
                workspace_id: config.workspaceId,
                thread_id: config.threadId,
                requester: config.requester,
                assignee: input.agentA,
                connector: { connector_id: 'pattern-direct-handoff', platform: input.agentA.platform, protocol: 'a2a' },
                payload: { kind: 'text', text: input.prompt },
                tags: ['pattern:direct-handoff', 'phase:a'],
            });
            if (taskA.ok === false)
                return { success: false, patternType: this.patternType, taskIds, error: taskA.error.message };
            taskIds.push(taskA.data.id);
            this.transitionOrThrow(taskA.data.id, 'working', input.agentA.agent_id, 'Phase A started');
            await contextBridge.createContext(taskA.data.id, 'metadata', {
                pattern: this.patternType,
                phase: 'A',
                prompt: input.prompt,
            });
            this.transitionOrThrow(taskA.data.id, 'completed', input.agentA.agent_id, 'Phase A completed', `Phase A done by ${input.agentA.agent_id}`);
            this.postMessage(threadId, input.agentA.agent_id, `Phase A complete. Handing off to @${input.agentB.agent_id}.`);
            const taskB = lifecycle.createTask({
                workspace_id: config.workspaceId,
                thread_id: config.threadId,
                requester: config.requester,
                assignee: input.agentB,
                connector: { connector_id: 'pattern-direct-handoff', platform: input.agentB.platform, protocol: 'a2a' },
                payload: {
                    kind: 'text',
                    text: input.handoffInstructions
                        ? `${input.handoffInstructions}\n\nOriginal task: ${input.prompt}`
                        : `Continue from handoff.\n\nOriginal task: ${input.prompt}`,
                },
                tags: ['pattern:direct-handoff', 'phase:b'],
            });
            if (taskB.ok === false)
                return { success: false, patternType: this.patternType, taskIds, error: taskB.error.message };
            taskIds.push(taskB.data.id);
            await contextBridge.transferContext(taskA.data.id, taskB.data.id);
            this.transitionOrThrow(taskB.data.id, 'working', input.agentB.agent_id, 'Phase B started');
            this.transitionOrThrow(taskB.data.id, 'completed', input.agentB.agent_id, 'Phase B completed', `Phase B done by ${input.agentB.agent_id}`);
            this.postMessage(threadId, input.agentB.agent_id, 'Direct handoff finished.');
            return {
                success: true,
                patternType: this.patternType,
                taskIds,
                finalResult: `Direct handoff complete: ${input.agentA.agent_id} -> ${input.agentB.agent_id}`,
                metadata: { taskAId: taskA.data.id, taskBId: taskB.data.id },
            };
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.postMessage(threadId, config.requester.agent_id, `Direct handoff failed: ${error}`);
            return { success: false, patternType: this.patternType, taskIds, error };
        }
    }
    transitionOrThrow(taskId, target_state, triggeredBy, reason, resultText) {
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = lifecycle.transitionTask(taskId, {
            target_state,
            triggered_by: triggeredBy,
            reason,
            ...(resultText ? { result: { text: resultText } } : {}),
        });
        if (result.ok === false) {
            throw new Error(result.error.message);
        }
    }
    ensureChannel(config, participants) {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const existing = svc.listChannels().find((channel) => channel.name === `handoff-${config.threadId}`);
        if (existing)
            return existing.id;
        const uniqueMembers = Array.from(new Set(participants.map((p) => p.agent_id)));
        const channel = svc.createChannel({
            name: `handoff-${config.threadId}`,
            scope: 'channel',
            memberAgentIds: uniqueMembers,
        });
        return channel.id;
    }
    ensureThread(channelId) {
        const svc = (0, collaboration_service_1.getCollaborationSvc)();
        const existing = svc.listThreads(channelId)[0];
        if (existing)
            return existing.id;
        return svc.createThread(channelId, 'Direct handoff').id;
    }
    postMessage(threadId, senderAgentId, text) {
        try {
            (0, collaboration_service_1.getCollaborationSvc)().sendMessage({ threadId, senderAgentId, text });
        }
        catch {
            // Best effort
        }
    }
}
exports.DirectHandoffPattern = DirectHandoffPattern;
