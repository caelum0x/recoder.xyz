"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AControlPlane = exports.ClaudeConnectorAdapter = exports.CodexConnectorAdapter = exports.UnifiedPolicyPlane = exports.InMemoryTaskStore = exports.InMemoryCollaborationService = exports.InMemoryAuditLogService = exports.InMemoryAgentRegistry = void 0;
const bridge_1 = require("./bridge");
class InMemoryAgentRegistry {
    agents = new Map();
    register(agent) {
        this.agents.set(agent.identity.id, agent);
    }
    unregister(agentId) {
        return this.agents.delete(agentId);
    }
    get(agentId) {
        return this.agents.get(agentId);
    }
    list() {
        return [...this.agents.values()];
    }
    discover(query = {}) {
        return this.list().filter((agent) => {
            if (query.protocol && agent.protocol !== query.protocol)
                return false;
            if (query.platform && agent.identity.platform !== query.platform)
                return false;
            if (query.tier && agent.tier !== query.tier)
                return false;
            if (query.status && agent.status !== query.status)
                return false;
            if (query.skillTag) {
                const inCard = agent.card.skills.some((skill) => skill.tags.includes(query.skillTag));
                const inTags = agent.tags.includes(query.skillTag);
                if (!inCard && !inTags)
                    return false;
            }
            return true;
        });
    }
}
exports.InMemoryAgentRegistry = InMemoryAgentRegistry;
class InMemoryAuditLogService {
    entries = [];
    append(entry) {
        this.entries.push(entry);
    }
    list() {
        return [...this.entries];
    }
    listByTask(taskId) {
        return this.entries.filter((entry) => entry.taskId === taskId);
    }
    listByConnector(connectorId) {
        return this.entries.filter((entry) => entry.connectorId === connectorId);
    }
}
exports.InMemoryAuditLogService = InMemoryAuditLogService;
class InMemoryCollaborationService {
    channels = new Map();
    threads = new Map();
    messages = new Map();
    createChannel(input) {
        const channel = {
            id: input.id,
            scope: input.scope,
            name: input.name,
            memberAgentIds: [...input.memberAgentIds],
            createdAt: new Date().toISOString(),
        };
        this.channels.set(channel.id, channel);
        return channel;
    }
    createThread(input) {
        const channel = this.channels.get(input.channelId);
        if (!channel)
            throw new Error(`Channel not found: ${input.channelId}`);
        const thread = {
            id: input.id,
            channelId: input.channelId,
            title: input.title,
            createdAt: new Date().toISOString(),
        };
        this.threads.set(thread.id, thread);
        return thread;
    }
    sendMessage(input) {
        const thread = this.threads.get(input.threadId);
        if (!thread)
            throw new Error(`Thread not found: ${input.threadId}`);
        const channel = this.channels.get(thread.channelId);
        if (!channel)
            throw new Error(`Channel not found: ${thread.channelId}`);
        if (!channel.memberAgentIds.includes(input.senderAgentId)) {
            throw new Error(`Sender ${input.senderAgentId} is not a member of channel ${thread.channelId}`);
        }
        const message = {
            id: input.id,
            threadId: input.threadId,
            senderAgentId: input.senderAgentId,
            text: input.text,
            createdAt: new Date().toISOString(),
        };
        const list = this.messages.get(input.threadId) ?? [];
        list.push(message);
        this.messages.set(input.threadId, list);
        return message;
    }
    listChannels() {
        return [...this.channels.values()];
    }
    listThreads(channelId) {
        return [...this.threads.values()].filter((thread) => thread.channelId === channelId);
    }
    listMessages(threadId) {
        return [...(this.messages.get(threadId) ?? [])];
    }
}
exports.InMemoryCollaborationService = InMemoryCollaborationService;
class InMemoryTaskStore {
    tasks = new Map();
    events = new Map();
    create(task) {
        this.tasks.set(task.id, task);
        return task;
    }
    get(taskId) {
        return this.tasks.get(taskId);
    }
    update(taskId, patch) {
        const existing = this.tasks.get(taskId);
        if (!existing) {
            throw new Error(`Task not found: ${taskId}`);
        }
        const next = {
            ...existing,
            ...patch,
            updatedAt: patch.updatedAt ?? new Date().toISOString(),
        };
        this.tasks.set(taskId, next);
        return next;
    }
    listByThread(threadId) {
        return [...this.tasks.values()].filter((task) => task.threadId === threadId);
    }
    appendEvent(event) {
        const list = this.events.get(event.taskId) ?? [];
        list.push(event);
        this.events.set(event.taskId, list);
    }
    getEvents(taskId) {
        return this.events.get(taskId) ?? [];
    }
}
exports.InMemoryTaskStore = InMemoryTaskStore;
class UnifiedPolicyPlane {
    rules = new Map();
    handlers = new Map();
    setRule(agentId, action, rule) {
        const actionRules = this.rules.get(agentId) ?? new Map();
        actionRules.set(action, rule);
        this.rules.set(agentId, actionRules);
    }
    setPromptHandler(agentId, handler) {
        this.handlers.set(agentId, handler);
    }
    async check(agentId, action, details = {}) {
        const actionRules = this.rules.get(agentId);
        const rule = actionRules?.get(action) ?? 'prompt';
        if (rule === 'auto') {
            return { action, approved: true, reason: 'Auto-approved by policy rule', rule };
        }
        if (rule === 'deny') {
            return { action, approved: false, reason: 'Denied by policy rule', rule };
        }
        const handler = this.handlers.get(agentId);
        if (!handler) {
            return { action, approved: false, reason: 'Prompt rule but no handler configured', rule };
        }
        const approved = await handler({ agentId, action, details });
        return {
            action,
            approved,
            reason: approved ? 'Approved by prompt handler' : 'Rejected by prompt handler',
            rule,
        };
    }
}
exports.UnifiedPolicyPlane = UnifiedPolicyPlane;
class CodexConnectorAdapter {
    rpcClient;
    auditSink;
    platform = 'codex';
    protocol = 'jsonrpc';
    taskStates = new Map();
    constructor(rpcClient, auditSink) {
        this.rpcClient = rpcClient;
        this.auditSink = auditSink;
    }
    async discoverCapabilities() {
        return [
            {
                id: 'code-generation',
                name: 'Code Generation',
                description: 'Generate and refactor code via Codex JSON-RPC task execution',
            },
            {
                id: 'task-lifecycle',
                name: 'Task Lifecycle',
                description: 'Submit and track task state transitions through Codex runtime',
            },
        ];
    }
    async executeTask(request) {
        this.taskStates.set(request.taskId, 'working');
        const envelope = (0, bridge_1.codexToEnvelope)({
            message: { role: 'user', content: request.prompt },
            from: request.requester,
            to: request.assignee,
            messageId: request.taskId,
            threadId: request.threadId,
        });
        const wire = (0, bridge_1.envelopeToCodex)(envelope);
        const response = await this.rpcClient.sendTask({
            id: request.taskId,
            sessionId: request.threadId,
            message: wire,
        });
        if (response.status === 'failed') {
            this.taskStates.set(request.taskId, 'failed');
            return { state: 'failed', resultText: response.error ?? 'Codex task failed', raw: response };
        }
        if (response.status === 'working') {
            this.taskStates.set(request.taskId, 'working');
            return { state: 'working', resultText: response.output, raw: response };
        }
        this.taskStates.set(request.taskId, 'completed');
        return { state: 'completed', resultText: response.output, raw: response };
    }
    async *streamTaskUpdates(taskId) {
        const state = this.taskStates.get(taskId);
        if (!state)
            return;
        yield { taskId, state };
    }
    async cancelTask(taskId) {
        const current = this.taskStates.get(taskId);
        if (!current || current === 'completed' || current === 'failed' || current === 'cancelled') {
            return false;
        }
        this.taskStates.set(taskId, 'cancelled');
        return true;
    }
    async extractContext(scope) {
        return {
            scope,
            metadata: {
                platform: this.platform,
                protocol: this.protocol,
            },
        };
    }
    mapPlatformActionToPolicyAction(action) {
        const table = {
            'fs.read': 'file:read',
            'fs.write': 'file:write',
            'fs.delete': 'file:delete',
            'shell.exec': 'bash:exec',
            'net.request': 'network:call',
            'git.push': 'git:push',
            'env.read': 'env:access',
        };
        return table[action];
    }
    async emitAuditEvent(event) {
        if (this.auditSink) {
            await this.auditSink(event);
        }
    }
}
exports.CodexConnectorAdapter = CodexConnectorAdapter;
class ClaudeConnectorAdapter {
    mcpClient;
    auditSink;
    platform = 'claude_code';
    protocol = 'mcp';
    taskStates = new Map();
    constructor(mcpClient, auditSink) {
        this.mcpClient = mcpClient;
        this.auditSink = auditSink;
    }
    async discoverCapabilities() {
        return [
            {
                id: 'mcp-tool-exec',
                name: 'MCP Tool Execution',
                description: 'Execute Claude Code tool calls over MCP transport',
            },
            {
                id: 'architecture-review',
                name: 'Architecture and Review',
                description: 'Produce architecture guidance and code-review outputs',
            },
        ];
    }
    async executeTask(request) {
        this.taskStates.set(request.taskId, 'working');
        const envelope = (0, bridge_1.claudeCodeToEnvelope)({
            message: { role: 'user', content: request.prompt },
            from: request.requester,
            to: request.assignee,
            messageId: request.taskId,
            threadId: request.threadId,
        });
        const wire = (0, bridge_1.envelopeToClaudeCode)(envelope);
        const promptText = typeof wire.content === 'string'
            ? wire.content
            : wire.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('\n');
        const response = await this.mcpClient.callTool({
            name: 'default',
            arguments: { prompt: promptText },
        });
        if (response.error) {
            this.taskStates.set(request.taskId, 'failed');
            return { state: 'failed', resultText: response.error, raw: response };
        }
        this.taskStates.set(request.taskId, 'completed');
        return { state: 'completed', resultText: response.content ?? '', raw: response };
    }
    async *streamTaskUpdates(taskId) {
        const state = this.taskStates.get(taskId);
        if (!state)
            return;
        yield { taskId, state };
    }
    async cancelTask(taskId) {
        const current = this.taskStates.get(taskId);
        if (!current || current === 'completed' || current === 'failed' || current === 'cancelled') {
            return false;
        }
        this.taskStates.set(taskId, 'cancelled');
        return true;
    }
    async extractContext(scope) {
        return {
            scope,
            metadata: {
                platform: this.platform,
                protocol: this.protocol,
            },
        };
    }
    mapPlatformActionToPolicyAction(action) {
        const table = {
            Read: 'file:read',
            Write: 'file:write',
            Edit: 'file:write',
            Bash: 'bash:exec',
            WebFetch: 'network:call',
            Env: 'env:access',
        };
        return table[action];
    }
    async emitAuditEvent(event) {
        if (this.auditSink) {
            await this.auditSink(event);
        }
    }
}
exports.ClaudeConnectorAdapter = ClaudeConnectorAdapter;
class A2AControlPlane {
    registry;
    taskStore;
    policy;
    auditLog;
    collaboration;
    connectors = new Map();
    constructor(registry, taskStore, policy, auditLog = new InMemoryAuditLogService(), collaboration = new InMemoryCollaborationService()) {
        this.registry = registry;
        this.taskStore = taskStore;
        this.policy = policy;
        this.auditLog = auditLog;
        this.collaboration = collaboration;
    }
    attachConnector(agentId, connector) {
        this.connectors.set(agentId, connector);
    }
    async discoverCapabilities(agentId) {
        const connector = this.connectors.get(agentId);
        if (!connector)
            throw new Error(`No connector attached for agent: ${agentId}`);
        return connector.discoverCapabilities();
    }
    async extractConnectorContext(agentId, scope) {
        const connector = this.connectors.get(agentId);
        if (!connector)
            throw new Error(`No connector attached for agent: ${agentId}`);
        return connector.extractContext(scope);
    }
    streamTaskUpdates(taskId) {
        const task = this.taskStore.get(taskId);
        if (!task)
            throw new Error(`Task not found: ${taskId}`);
        const connector = this.connectors.get(task.assignee.id);
        if (!connector)
            throw new Error(`No connector attached for assignee: ${task.assignee.id}`);
        return connector.streamTaskUpdates(taskId);
    }
    async cancelTask(taskId) {
        const task = this.taskStore.get(taskId);
        if (!task)
            throw new Error(`Task not found: ${taskId}`);
        const connector = this.connectors.get(task.assignee.id);
        if (!connector)
            throw new Error(`No connector attached for assignee: ${task.assignee.id}`);
        const cancelled = await connector.cancelTask(taskId);
        if (!cancelled) {
            return task;
        }
        const now = new Date().toISOString();
        this.taskStore.appendEvent({
            id: `${taskId}:cancelled`,
            taskId,
            kind: 'task.cancelled',
            createdAt: now,
            details: { platform: connector.platform },
        });
        await this.emitConnectorAudit(connector, {
            connectorId: task.assignee.id,
            taskId,
            kind: 'task.cancelled',
            createdAt: now,
            details: { platform: connector.platform },
        });
        return this.taskStore.update(taskId, { state: 'cancelled' });
    }
    getAuditEntries(taskId) {
        if (!taskId)
            return this.auditLog.list();
        return this.auditLog.listByTask(taskId);
    }
    createChannel(input) {
        return this.collaboration.createChannel(input);
    }
    createThread(input) {
        return this.collaboration.createThread(input);
    }
    postMessage(input) {
        return this.collaboration.sendMessage(input);
    }
    listChannelThreads(channelId) {
        return this.collaboration.listThreads(channelId);
    }
    listThreadMessages(threadId) {
        return this.collaboration.listMessages(threadId);
    }
    async emitConnectorAudit(connector, event) {
        this.auditLog.append({
            id: `${event.taskId ?? 'global'}:${event.kind}:${event.createdAt}`,
            connectorId: event.connectorId,
            taskId: event.taskId,
            kind: event.kind,
            createdAt: event.createdAt,
            details: event.details,
        });
        await connector.emitAuditEvent(event);
    }
    async submitTask(input) {
        const requester = this.registry.get(input.requesterId);
        if (!requester)
            throw new Error(`Requester is not registered: ${input.requesterId}`);
        const assignee = this.registry.get(input.assigneeId);
        if (!assignee)
            throw new Error(`Assignee is not registered: ${input.assigneeId}`);
        const now = new Date().toISOString();
        const baseTask = {
            id: input.taskId,
            threadId: input.threadId,
            createdAt: now,
            updatedAt: now,
            requester: requester.identity,
            assignee: assignee.identity,
            state: 'submitted',
            prompt: input.prompt,
        };
        this.taskStore.create(baseTask);
        this.taskStore.appendEvent({
            id: `${input.taskId}:submitted`,
            taskId: input.taskId,
            kind: 'task.submitted',
            createdAt: now,
            details: { requesterId: input.requesterId, assigneeId: input.assigneeId },
        });
        const connector = this.connectors.get(input.assigneeId);
        if (!connector) {
            return this.taskStore.update(input.taskId, {
                state: 'failed',
                error: `No connector attached for assignee: ${input.assigneeId}`,
            });
        }
        await this.emitConnectorAudit(connector, {
            connectorId: input.assigneeId,
            taskId: input.taskId,
            kind: 'task.submitted',
            createdAt: now,
            details: { requesterId: input.requesterId, assigneeId: input.assigneeId },
        });
        const effectiveRequiredAction = input.requiredAction ??
            (input.platformAction ? connector.mapPlatformActionToPolicyAction(input.platformAction) : undefined);
        if (effectiveRequiredAction) {
            const decision = await this.policy.check(input.assigneeId, effectiveRequiredAction, input.policyDetails ?? {});
            const decisionDetails = {
                action: decision.action,
                approved: decision.approved,
                reason: decision.reason,
                rule: decision.rule,
            };
            this.taskStore.appendEvent({
                id: `${input.taskId}:policy`,
                taskId: input.taskId,
                kind: 'policy.checked',
                createdAt: new Date().toISOString(),
                details: decisionDetails,
            });
            await this.emitConnectorAudit(connector, {
                connectorId: input.assigneeId,
                taskId: input.taskId,
                kind: 'policy.checked',
                createdAt: new Date().toISOString(),
                details: decisionDetails,
            });
            if (!decision.approved) {
                this.taskStore.appendEvent({
                    id: `${input.taskId}:failed`,
                    taskId: input.taskId,
                    kind: 'task.failed',
                    createdAt: new Date().toISOString(),
                    details: { platform: connector.platform, reason: decision.reason },
                });
                return this.taskStore.update(input.taskId, {
                    state: 'failed',
                    error: `Policy denied action ${effectiveRequiredAction}: ${decision.reason}`,
                });
            }
        }
        this.taskStore.update(input.taskId, { state: 'working' });
        const startedAt = new Date().toISOString();
        this.taskStore.appendEvent({
            id: `${input.taskId}:started`,
            taskId: input.taskId,
            kind: 'task.started',
            createdAt: startedAt,
            details: { platform: connector.platform, protocol: connector.protocol },
        });
        await this.emitConnectorAudit(connector, {
            connectorId: input.assigneeId,
            taskId: input.taskId,
            kind: 'task.started',
            createdAt: startedAt,
            details: { platform: connector.platform, protocol: connector.protocol },
        });
        const result = await connector.executeTask({
            taskId: input.taskId,
            threadId: input.threadId,
            prompt: input.prompt,
            requester: requester.identity,
            assignee: assignee.identity,
        });
        if (result.state === 'completed') {
            const completedAt = new Date().toISOString();
            this.taskStore.appendEvent({
                id: `${input.taskId}:completed`,
                taskId: input.taskId,
                kind: 'task.completed',
                createdAt: completedAt,
                details: { platform: connector.platform },
            });
            await this.emitConnectorAudit(connector, {
                connectorId: input.assigneeId,
                taskId: input.taskId,
                kind: 'task.completed',
                createdAt: completedAt,
                details: { platform: connector.platform },
            });
            return this.taskStore.update(input.taskId, {
                state: 'completed',
                resultText: result.resultText,
            });
        }
        if (result.state === 'working') {
            const progressAt = new Date().toISOString();
            this.taskStore.appendEvent({
                id: `${input.taskId}:progress`,
                taskId: input.taskId,
                kind: 'task.progress',
                createdAt: progressAt,
                details: { platform: connector.platform },
            });
            await this.emitConnectorAudit(connector, {
                connectorId: input.assigneeId,
                taskId: input.taskId,
                kind: 'task.progress',
                createdAt: progressAt,
                details: { platform: connector.platform },
            });
            return this.taskStore.update(input.taskId, {
                state: 'working',
                resultText: result.resultText,
            });
        }
        const failedAt = new Date().toISOString();
        this.taskStore.appendEvent({
            id: `${input.taskId}:failed`,
            taskId: input.taskId,
            kind: 'task.failed',
            createdAt: failedAt,
            details: { platform: connector.platform },
        });
        await this.emitConnectorAudit(connector, {
            connectorId: input.assigneeId,
            taskId: input.taskId,
            kind: 'task.failed',
            createdAt: failedAt,
            details: { platform: connector.platform },
        });
        return this.taskStore.update(input.taskId, {
            state: 'failed',
            error: result.resultText ?? 'Connector returned failed state',
        });
    }
}
exports.A2AControlPlane = A2AControlPlane;
