"use strict";
/**
 * @module patterns/supervisor-orchestration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorOrchestrationPattern = void 0;
const task_lifecycle_service_1 = require("../task-lifecycle.service");
const context_bridge_service_1 = require("../context-bridge.service");
const collaboration_service_1 = require("../collaboration.service");
class SupervisorOrchestrationPattern {
    patternType = 'supervisor';
    async execute(config, input) {
        if (input.kind !== 'supervisor') {
            return { success: false, patternType: this.patternType, taskIds: [], error: 'Invalid input kind' };
        }
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const contextBridge = (0, context_bridge_service_1.getContextBridgeService)();
        const taskIds = [];
        const channelId = this.ensureChannel(config, [config.requester, input.supervisor, ...input.subtasks.map((s) => s.assignee)]);
        const threadId = this.ensureThread(channelId);
        try {
            const master = lifecycle.createTask({
                workspace_id: config.workspaceId,
                thread_id: config.threadId,
                requester: config.requester,
                assignee: input.supervisor,
                connector: { connector_id: 'pattern-supervisor', platform: input.supervisor.platform, protocol: 'a2a' },
                payload: { kind: 'text', text: input.prompt },
                tags: ['pattern:supervisor', 'master'],
            });
            if (master.ok === false)
                return { success: false, patternType: this.patternType, taskIds, error: master.error.message };
            taskIds.push(master.data.id);
            this.transitionOrThrow(master.data.id, 'working', input.supervisor.agent_id, 'Master task started');
            await contextBridge.createContext(master.data.id, 'metadata', {
                pattern: this.patternType,
                subtaskCount: input.subtasks.length,
            });
            let completedCount = 0;
            let failedCount = 0;
            for (let index = 0; index < input.subtasks.length; index++) {
                const subtask = input.subtasks[index];
                const created = lifecycle.createTask({
                    workspace_id: config.workspaceId,
                    thread_id: config.threadId,
                    requester: input.supervisor,
                    assignee: subtask.assignee,
                    connector: { connector_id: 'pattern-supervisor', platform: subtask.assignee.platform, protocol: 'a2a' },
                    payload: { kind: 'text', text: subtask.prompt },
                    tags: ['pattern:supervisor', `subtask:${index + 1}`],
                });
                if (created.ok === false) {
                    failedCount++;
                    this.postMessage(threadId, input.supervisor.agent_id, `Subtask ${index + 1} creation failed: ${created.error.message}`);
                    continue;
                }
                taskIds.push(created.data.id);
                await contextBridge.transferContext(master.data.id, created.data.id);
                this.transitionOrThrow(created.data.id, 'working', subtask.assignee.agent_id, 'Subtask started');
                this.transitionOrThrow(created.data.id, 'completed', subtask.assignee.agent_id, 'Subtask completed', subtask.prompt);
                completedCount++;
                this.postMessage(threadId, subtask.assignee.agent_id, `Subtask ${index + 1} completed.`);
            }
            this.transitionOrThrow(master.data.id, 'completed', input.supervisor.agent_id, 'Master task completed', `Completed ${completedCount}/${input.subtasks.length} subtasks`);
            return {
                success: failedCount === 0,
                patternType: this.patternType,
                taskIds,
                finalResult: `Supervisor run: ${completedCount}/${input.subtasks.length} subtasks completed`,
                metadata: { masterTaskId: master.data.id, completedCount, failedCount },
            };
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.postMessage(threadId, config.requester.agent_id, `Supervisor orchestration failed: ${error}`);
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
        const existing = svc.listChannels().find((channel) => channel.name === `supervisor-${config.threadId}`);
        if (existing)
            return existing.id;
        const uniqueMembers = Array.from(new Set(participants.map((p) => p.agent_id)));
        const channel = svc.createChannel({
            name: `supervisor-${config.threadId}`,
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
        return svc.createThread(channelId, 'Supervisor orchestration').id;
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
exports.SupervisorOrchestrationPattern = SupervisorOrchestrationPattern;
