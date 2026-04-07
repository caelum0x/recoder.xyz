"use strict";
/**
 * @module a2a
 *
 * Barrel export for the docker-backend A2A task lifecycle layer, the
 * Agent Messaging Bus (AMB) collaboration layer, and the Agent Registry.
 *
 * Provides:
 * - `TaskLifecycleService` -- the core service for creating, transitioning,
 *   and querying task envelopes with canonical state machine enforcement.
 * - `taskLifecycleRouter` -- Express router for the REST API endpoints.
 * - `AMBCollaborationService` -- singleton service for channels, threads,
 *   messages, and @mention routing.
 * - `collaborationRouter` -- Express router for the AMB REST endpoints.
 * - `HeartbeatTracker` -- agent liveness tracking via periodic heartbeats.
 * - `heartbeatRouter` -- Express router for heartbeat / health endpoints.
 * - `AgentRegistryService` -- service for agent registration, discovery,
 *   heartbeat tracking, and self-registration with platform defaults.
 * - `agentRegistryRouter` -- Express router for the Agent Registry REST API.
 * - `ConnectorHealthMonitor` -- monitors spawned connector child processes
 *   with auto-restart, exponential backoff, and circuit breaker.
 * - `connectorHealthRouter` -- Express router for connector health endpoints.
 * - Middleware functions for request validation and task loading.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishMessageDeleted = exports.publishMessageUpdated = exports.publishChannelMessage = exports.resetA2AEventBridge = exports.wireA2AEventBridge = exports.AGENT_EVENT_TYPES = exports.CHANNEL_EVENT_TYPES = exports.TERMINAL_TASK_EVENT_TYPES = exports.TASK_EVENT_TYPES = exports.resetA2AEventBus = exports.getA2AEventBus = exports.A2AEventType = exports.A2AEventBus = exports.validateDiscoveryQuery = exports.validateSelfRegisterBody = exports.validateRegisterBody = exports.agentRegistryRouter = exports.DEFAULT_AGENTS = exports.resetAgentRegistryService = exports.getAgentRegistryService = exports.AgentRegistryService = exports.heartbeatRouter = exports.resetHeartbeatTracker = exports.setHeartbeatTracker = exports.getHeartbeatTracker = exports.HeartbeatEventEmitter = exports.HeartbeatTracker = exports.validateThreadIdParam = exports.validateChannelIdParam = exports.validateSendMessageBody = exports.validateCreateThreadBody = exports.validateCreateChannelBody = exports.collaborationRouter = exports.parseMentions = exports.resetCollaborationSvc = exports.initCollaborationSvc = exports.getCollaborationSvc = exports.AMBCollaborationService = exports.parseJsonTextBody = exports.loadTaskEnvelope = exports.validateTransitionBody = exports.validateCreateTaskBody = exports.taskLifecycleRouter = exports.RedisTaskStore = exports.generateId = exports.resetTaskLifecycleService = exports.disposeTaskLifecycleService = exports.getTaskLifecycleService = exports.InMemoryTaskStore = exports.TaskLifecycleService = void 0;
exports.a2aOpenApiRouter = exports.contextBridgeRouter = exports.resetContextBridgeService = exports.getContextBridgeService = exports.ContextBridgeService = exports.replitConnectorRouter = exports.getReplitConnectorIdentity = exports.resetReplitConnectorRuntime = exports.getReplitConnectorRuntime = exports.ReplitConnectorRuntime = exports.windsurfConnectorRouter = exports.getWindsurfConnectorIdentity = exports.resetWindsurfConnectorRuntime = exports.getWindsurfConnectorRuntime = exports.WindsurfConnectorRuntime = exports.cursorConnectorRouter = exports.getCursorConnectorIdentity = exports.resetCursorConnectorRuntime = exports.getCursorConnectorRuntime = exports.CursorConnectorRuntime = exports.opencodeConnectorRouter = exports.getOpencodeConnectorIdentity = exports.resetOpencodeConnectorRuntime = exports.getOpencodeConnectorRuntime = exports.OpencodeConnectorRuntime = exports.codexConnectorRouter = exports.getCodexConnectorIdentity = exports.resetCodexConnectorRuntime = exports.getCodexConnectorRuntime = exports.CodexConnectorRuntime = exports.connectorHealthRouter = exports.resetConnectorHealthMonitor = exports.setConnectorHealthMonitor = exports.getConnectorHealthMonitor = exports.ConnectorHealthEventEmitter = exports.ConnectorHealthMonitor = exports.DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG = exports.claudeConnectorRouter = exports.getClaudeConnectorIdentity = exports.resetClaudeConnectorRuntime = exports.getClaudeConnectorRuntime = exports.ClaudeConnectorRuntime = exports.sseStreamRouter = exports.publishAgentOffline = exports.publishAgentOnline = exports.publishAgentDeregistered = exports.publishAgentRegistered = exports.publishMemberLeft = exports.publishMemberJoined = exports.publishThreadCreated = void 0;
exports.A2ARBACService = exports.createTraceMiddleware = exports.resetTraceService = exports.getTraceService = exports.A2ATraceService = exports.DEFAULT_AGENT_LIMITS = exports.DEFAULT_ADAPTER_LIMITS = exports.createRateLimitMiddleware = exports.resetA2ARateLimiter = exports.getA2ARateLimiter = exports.A2ARateLimiter = exports.validateAggregationBody = exports.validateCapabilityMatchBody = exports.validateExecuteBody = exports.validateGitAdapterConfig = exports.validateRestAdapterConfig = exports.validatePaginationParams = exports.validateOptionalFields = exports.validateRequiredFields = exports.validateIdParam = exports.resetTaskResultAggregator = exports.getTaskResultAggregator = exports.TaskResultAggregator = exports.resetCapabilityMatcher = exports.getCapabilityMatcher = exports.CapabilityMatcherService = exports.resetAdapterRegistry = exports.getAdapterRegistry = exports.AdapterRegistry = exports.gitAdapterRouter = exports.restAdapterRouter = exports.DEFAULT_GIT_ADAPTER_CONFIG = exports.resetGitAdapters = exports.unregisterGitAdapter = exports.listGitAdapters = exports.getGitAdapter = exports.registerGitAdapter = exports.DefaultGitExecutor = exports.GitAdapter = exports.DEFAULT_REST_ADAPTER_CONFIG = exports.resetRestAdapters = exports.unregisterRestAdapter = exports.listRestAdapters = exports.getRestAdapter = exports.registerRestAdapter = exports.buildEnvelope = exports.RestAdapter = exports.resetA2ASloMetrics = exports.getA2ASloMetrics = exports.a2aSloMetricsRouter = void 0;
exports.isRetryableError = exports.createRetryableExecutor = exports.withConnectorRetry = exports.resetIntegrationWiringService = exports.getIntegrationWiringService = exports.IntegrationWiringService = exports.adminRouter = exports.workflowMessagingRouter = exports.resetDelegationChainService = exports.getDelegationChainService = exports.DelegationChainService = exports.resetAgentMessagingService = exports.getAgentMessagingService = exports.AgentMessagingService = exports.resetWorkflowEngine = exports.getWorkflowEngine = exports.WorkflowEngine = exports.resetA2ATaskScheduler = exports.getA2ATaskScheduler = exports.A2ATaskScheduler = exports.resetA2ATaskQueue = exports.getA2ATaskQueue = exports.A2ATaskQueue = exports.orchestrationRouter = exports.resetSupervisorOrchestrator = exports.getSupervisorOrchestrator = exports.SupervisorOrchestrator = exports.resetScatterGatherOrchestrator = exports.getScatterGatherOrchestrator = exports.ScatterGatherOrchestrator = exports.resetPipelineOrchestrator = exports.getPipelineOrchestrator = exports.PipelineOrchestrator = exports.createA2AGateway = exports.requireA2ARole = exports.requireA2APermission = exports.requireA2AAuth = exports.extractA2AIdentity = exports.ROLE_HIERARCHY = exports.resetA2ARBACService = exports.getA2ARBACService = void 0;
// Service
var task_lifecycle_service_1 = require("./task-lifecycle.service");
Object.defineProperty(exports, "TaskLifecycleService", { enumerable: true, get: function () { return task_lifecycle_service_1.TaskLifecycleService; } });
Object.defineProperty(exports, "InMemoryTaskStore", { enumerable: true, get: function () { return task_lifecycle_service_1.InMemoryTaskStore; } });
Object.defineProperty(exports, "getTaskLifecycleService", { enumerable: true, get: function () { return task_lifecycle_service_1.getTaskLifecycleService; } });
Object.defineProperty(exports, "disposeTaskLifecycleService", { enumerable: true, get: function () { return task_lifecycle_service_1.disposeTaskLifecycleService; } });
Object.defineProperty(exports, "resetTaskLifecycleService", { enumerable: true, get: function () { return task_lifecycle_service_1.resetTaskLifecycleService; } });
Object.defineProperty(exports, "generateId", { enumerable: true, get: function () { return task_lifecycle_service_1.generateId; } });
// Redis-backed TaskStore
var redis_task_store_1 = require("./redis-task-store");
Object.defineProperty(exports, "RedisTaskStore", { enumerable: true, get: function () { return redis_task_store_1.RedisTaskStore; } });
// Routes
var task_lifecycle_routes_1 = require("./task-lifecycle.routes");
Object.defineProperty(exports, "taskLifecycleRouter", { enumerable: true, get: function () { return task_lifecycle_routes_1.taskLifecycleRouter; } });
// Middleware
var task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
Object.defineProperty(exports, "validateCreateTaskBody", { enumerable: true, get: function () { return task_lifecycle_middleware_1.validateCreateTaskBody; } });
Object.defineProperty(exports, "validateTransitionBody", { enumerable: true, get: function () { return task_lifecycle_middleware_1.validateTransitionBody; } });
Object.defineProperty(exports, "loadTaskEnvelope", { enumerable: true, get: function () { return task_lifecycle_middleware_1.loadTaskEnvelope; } });
Object.defineProperty(exports, "parseJsonTextBody", { enumerable: true, get: function () { return task_lifecycle_middleware_1.parseJsonTextBody; } });
// AMB Collaboration Service
var collaboration_service_1 = require("./collaboration.service");
Object.defineProperty(exports, "AMBCollaborationService", { enumerable: true, get: function () { return collaboration_service_1.AMBCollaborationService; } });
Object.defineProperty(exports, "getCollaborationSvc", { enumerable: true, get: function () { return collaboration_service_1.getCollaborationSvc; } });
Object.defineProperty(exports, "initCollaborationSvc", { enumerable: true, get: function () { return collaboration_service_1.initCollaborationSvc; } });
Object.defineProperty(exports, "resetCollaborationSvc", { enumerable: true, get: function () { return collaboration_service_1.resetCollaborationSvc; } });
Object.defineProperty(exports, "parseMentions", { enumerable: true, get: function () { return collaboration_service_1.parseMentions; } });
// AMB Collaboration Routes
var collaboration_routes_1 = require("./collaboration.routes");
Object.defineProperty(exports, "collaborationRouter", { enumerable: true, get: function () { return collaboration_routes_1.collaborationRouter; } });
// AMB Collaboration Middleware
var collaboration_middleware_1 = require("./collaboration.middleware");
Object.defineProperty(exports, "validateCreateChannelBody", { enumerable: true, get: function () { return collaboration_middleware_1.validateCreateChannelBody; } });
Object.defineProperty(exports, "validateCreateThreadBody", { enumerable: true, get: function () { return collaboration_middleware_1.validateCreateThreadBody; } });
Object.defineProperty(exports, "validateSendMessageBody", { enumerable: true, get: function () { return collaboration_middleware_1.validateSendMessageBody; } });
Object.defineProperty(exports, "validateChannelIdParam", { enumerable: true, get: function () { return collaboration_middleware_1.validateChannelIdParam; } });
Object.defineProperty(exports, "validateThreadIdParam", { enumerable: true, get: function () { return collaboration_middleware_1.validateThreadIdParam; } });
// Heartbeat tracker
var heartbeat_tracker_service_1 = require("./heartbeat-tracker.service");
Object.defineProperty(exports, "HeartbeatTracker", { enumerable: true, get: function () { return heartbeat_tracker_service_1.HeartbeatTracker; } });
Object.defineProperty(exports, "HeartbeatEventEmitter", { enumerable: true, get: function () { return heartbeat_tracker_service_1.HeartbeatEventEmitter; } });
Object.defineProperty(exports, "getHeartbeatTracker", { enumerable: true, get: function () { return heartbeat_tracker_service_1.getHeartbeatTracker; } });
Object.defineProperty(exports, "setHeartbeatTracker", { enumerable: true, get: function () { return heartbeat_tracker_service_1.setHeartbeatTracker; } });
Object.defineProperty(exports, "resetHeartbeatTracker", { enumerable: true, get: function () { return heartbeat_tracker_service_1.resetHeartbeatTracker; } });
// Heartbeat routes
var heartbeat_routes_1 = require("./heartbeat.routes");
Object.defineProperty(exports, "heartbeatRouter", { enumerable: true, get: function () { return heartbeat_routes_1.heartbeatRouter; } });
// Agent Registry Service
var agent_registry_service_1 = require("./agent-registry.service");
Object.defineProperty(exports, "AgentRegistryService", { enumerable: true, get: function () { return agent_registry_service_1.AgentRegistryService; } });
Object.defineProperty(exports, "getAgentRegistryService", { enumerable: true, get: function () { return agent_registry_service_1.getAgentRegistryService; } });
Object.defineProperty(exports, "resetAgentRegistryService", { enumerable: true, get: function () { return agent_registry_service_1.resetAgentRegistryService; } });
Object.defineProperty(exports, "DEFAULT_AGENTS", { enumerable: true, get: function () { return agent_registry_service_1.DEFAULT_AGENTS; } });
// Agent Registry Routes
var agent_registry_routes_1 = require("./agent-registry.routes");
Object.defineProperty(exports, "agentRegistryRouter", { enumerable: true, get: function () { return agent_registry_routes_1.agentRegistryRouter; } });
// Agent Registry Middleware
var agent_registry_middleware_1 = require("./agent-registry.middleware");
Object.defineProperty(exports, "validateRegisterBody", { enumerable: true, get: function () { return agent_registry_middleware_1.validateRegisterBody; } });
Object.defineProperty(exports, "validateSelfRegisterBody", { enumerable: true, get: function () { return agent_registry_middleware_1.validateSelfRegisterBody; } });
Object.defineProperty(exports, "validateDiscoveryQuery", { enumerable: true, get: function () { return agent_registry_middleware_1.validateDiscoveryQuery; } });
// A2A Event Bus (pub/sub for real-time streaming)
var a2a_event_bus_1 = require("./a2a-event-bus");
Object.defineProperty(exports, "A2AEventBus", { enumerable: true, get: function () { return a2a_event_bus_1.A2AEventBus; } });
Object.defineProperty(exports, "A2AEventType", { enumerable: true, get: function () { return a2a_event_bus_1.A2AEventType; } });
Object.defineProperty(exports, "getA2AEventBus", { enumerable: true, get: function () { return a2a_event_bus_1.getA2AEventBus; } });
Object.defineProperty(exports, "resetA2AEventBus", { enumerable: true, get: function () { return a2a_event_bus_1.resetA2AEventBus; } });
Object.defineProperty(exports, "TASK_EVENT_TYPES", { enumerable: true, get: function () { return a2a_event_bus_1.TASK_EVENT_TYPES; } });
Object.defineProperty(exports, "TERMINAL_TASK_EVENT_TYPES", { enumerable: true, get: function () { return a2a_event_bus_1.TERMINAL_TASK_EVENT_TYPES; } });
Object.defineProperty(exports, "CHANNEL_EVENT_TYPES", { enumerable: true, get: function () { return a2a_event_bus_1.CHANNEL_EVENT_TYPES; } });
Object.defineProperty(exports, "AGENT_EVENT_TYPES", { enumerable: true, get: function () { return a2a_event_bus_1.AGENT_EVENT_TYPES; } });
// A2A Event Bridge (wires audit sinks -> event bus)
var a2a_event_bridge_1 = require("./a2a-event-bridge");
Object.defineProperty(exports, "wireA2AEventBridge", { enumerable: true, get: function () { return a2a_event_bridge_1.wireA2AEventBridge; } });
Object.defineProperty(exports, "resetA2AEventBridge", { enumerable: true, get: function () { return a2a_event_bridge_1.resetA2AEventBridge; } });
Object.defineProperty(exports, "publishChannelMessage", { enumerable: true, get: function () { return a2a_event_bridge_1.publishChannelMessage; } });
Object.defineProperty(exports, "publishMessageUpdated", { enumerable: true, get: function () { return a2a_event_bridge_1.publishMessageUpdated; } });
Object.defineProperty(exports, "publishMessageDeleted", { enumerable: true, get: function () { return a2a_event_bridge_1.publishMessageDeleted; } });
Object.defineProperty(exports, "publishThreadCreated", { enumerable: true, get: function () { return a2a_event_bridge_1.publishThreadCreated; } });
Object.defineProperty(exports, "publishMemberJoined", { enumerable: true, get: function () { return a2a_event_bridge_1.publishMemberJoined; } });
Object.defineProperty(exports, "publishMemberLeft", { enumerable: true, get: function () { return a2a_event_bridge_1.publishMemberLeft; } });
Object.defineProperty(exports, "publishAgentRegistered", { enumerable: true, get: function () { return a2a_event_bridge_1.publishAgentRegistered; } });
Object.defineProperty(exports, "publishAgentDeregistered", { enumerable: true, get: function () { return a2a_event_bridge_1.publishAgentDeregistered; } });
Object.defineProperty(exports, "publishAgentOnline", { enumerable: true, get: function () { return a2a_event_bridge_1.publishAgentOnline; } });
Object.defineProperty(exports, "publishAgentOffline", { enumerable: true, get: function () { return a2a_event_bridge_1.publishAgentOffline; } });
// SSE Stream Router
var sse_stream_router_1 = require("./sse-stream.router");
Object.defineProperty(exports, "sseStreamRouter", { enumerable: true, get: function () { return sse_stream_router_1.sseStreamRouter; } });
// Claude Code MCP Connector Runtime
var claude_connector_runtime_service_1 = require("./claude-connector-runtime.service");
Object.defineProperty(exports, "ClaudeConnectorRuntime", { enumerable: true, get: function () { return claude_connector_runtime_service_1.ClaudeConnectorRuntime; } });
Object.defineProperty(exports, "getClaudeConnectorRuntime", { enumerable: true, get: function () { return claude_connector_runtime_service_1.getClaudeConnectorRuntime; } });
Object.defineProperty(exports, "resetClaudeConnectorRuntime", { enumerable: true, get: function () { return claude_connector_runtime_service_1.resetClaudeConnectorRuntime; } });
Object.defineProperty(exports, "getClaudeConnectorIdentity", { enumerable: true, get: function () { return claude_connector_runtime_service_1.getClaudeConnectorIdentity; } });
// Claude Connector Routes
var claude_connector_routes_1 = require("./claude-connector.routes");
Object.defineProperty(exports, "claudeConnectorRouter", { enumerable: true, get: function () { return claude_connector_routes_1.claudeConnectorRouter; } });
// Connector Process types
var connector_process_1 = require("./connector-process");
Object.defineProperty(exports, "DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG", { enumerable: true, get: function () { return connector_process_1.DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG; } });
// Connector Health Monitor
var connector_health_monitor_service_1 = require("./connector-health-monitor.service");
Object.defineProperty(exports, "ConnectorHealthMonitor", { enumerable: true, get: function () { return connector_health_monitor_service_1.ConnectorHealthMonitor; } });
Object.defineProperty(exports, "ConnectorHealthEventEmitter", { enumerable: true, get: function () { return connector_health_monitor_service_1.ConnectorHealthEventEmitter; } });
Object.defineProperty(exports, "getConnectorHealthMonitor", { enumerable: true, get: function () { return connector_health_monitor_service_1.getConnectorHealthMonitor; } });
Object.defineProperty(exports, "setConnectorHealthMonitor", { enumerable: true, get: function () { return connector_health_monitor_service_1.setConnectorHealthMonitor; } });
Object.defineProperty(exports, "resetConnectorHealthMonitor", { enumerable: true, get: function () { return connector_health_monitor_service_1.resetConnectorHealthMonitor; } });
// Connector Health Routes
var connector_health_routes_1 = require("./connector-health.routes");
Object.defineProperty(exports, "connectorHealthRouter", { enumerable: true, get: function () { return connector_health_routes_1.connectorHealthRouter; } });
// Codex CLI Connector Runtime
var codex_connector_runtime_service_1 = require("./codex-connector-runtime.service");
Object.defineProperty(exports, "CodexConnectorRuntime", { enumerable: true, get: function () { return codex_connector_runtime_service_1.CodexConnectorRuntime; } });
Object.defineProperty(exports, "getCodexConnectorRuntime", { enumerable: true, get: function () { return codex_connector_runtime_service_1.getCodexConnectorRuntime; } });
Object.defineProperty(exports, "resetCodexConnectorRuntime", { enumerable: true, get: function () { return codex_connector_runtime_service_1.resetCodexConnectorRuntime; } });
Object.defineProperty(exports, "getCodexConnectorIdentity", { enumerable: true, get: function () { return codex_connector_runtime_service_1.getCodexConnectorIdentity; } });
// Codex Connector Routes
var codex_connector_routes_1 = require("./codex-connector.routes");
Object.defineProperty(exports, "codexConnectorRouter", { enumerable: true, get: function () { return codex_connector_routes_1.codexConnectorRouter; } });
// OpenCode Connector Runtime (experimental)
var opencode_connector_runtime_service_1 = require("./opencode-connector-runtime.service");
Object.defineProperty(exports, "OpencodeConnectorRuntime", { enumerable: true, get: function () { return opencode_connector_runtime_service_1.OpencodeConnectorRuntime; } });
Object.defineProperty(exports, "getOpencodeConnectorRuntime", { enumerable: true, get: function () { return opencode_connector_runtime_service_1.getOpencodeConnectorRuntime; } });
Object.defineProperty(exports, "resetOpencodeConnectorRuntime", { enumerable: true, get: function () { return opencode_connector_runtime_service_1.resetOpencodeConnectorRuntime; } });
Object.defineProperty(exports, "getOpencodeConnectorIdentity", { enumerable: true, get: function () { return opencode_connector_runtime_service_1.getOpencodeConnectorIdentity; } });
// OpenCode Connector Routes
var opencode_connector_routes_1 = require("./opencode-connector.routes");
Object.defineProperty(exports, "opencodeConnectorRouter", { enumerable: true, get: function () { return opencode_connector_routes_1.opencodeConnectorRouter; } });
// Cursor IDE Connector Runtime (Tier-2)
var cursor_connector_runtime_service_1 = require("./cursor-connector-runtime.service");
Object.defineProperty(exports, "CursorConnectorRuntime", { enumerable: true, get: function () { return cursor_connector_runtime_service_1.CursorConnectorRuntime; } });
Object.defineProperty(exports, "getCursorConnectorRuntime", { enumerable: true, get: function () { return cursor_connector_runtime_service_1.getCursorConnectorRuntime; } });
Object.defineProperty(exports, "resetCursorConnectorRuntime", { enumerable: true, get: function () { return cursor_connector_runtime_service_1.resetCursorConnectorRuntime; } });
Object.defineProperty(exports, "getCursorConnectorIdentity", { enumerable: true, get: function () { return cursor_connector_runtime_service_1.getCursorConnectorIdentity; } });
// Cursor Connector Routes
var cursor_connector_routes_1 = require("./cursor-connector.routes");
Object.defineProperty(exports, "cursorConnectorRouter", { enumerable: true, get: function () { return cursor_connector_routes_1.cursorConnectorRouter; } });
// Windsurf IDE Connector Runtime (Tier-2)
var windsurf_connector_runtime_service_1 = require("./windsurf-connector-runtime.service");
Object.defineProperty(exports, "WindsurfConnectorRuntime", { enumerable: true, get: function () { return windsurf_connector_runtime_service_1.WindsurfConnectorRuntime; } });
Object.defineProperty(exports, "getWindsurfConnectorRuntime", { enumerable: true, get: function () { return windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime; } });
Object.defineProperty(exports, "resetWindsurfConnectorRuntime", { enumerable: true, get: function () { return windsurf_connector_runtime_service_1.resetWindsurfConnectorRuntime; } });
Object.defineProperty(exports, "getWindsurfConnectorIdentity", { enumerable: true, get: function () { return windsurf_connector_runtime_service_1.getWindsurfConnectorIdentity; } });
// Windsurf Connector Routes
var windsurf_connector_routes_1 = require("./windsurf-connector.routes");
Object.defineProperty(exports, "windsurfConnectorRouter", { enumerable: true, get: function () { return windsurf_connector_routes_1.windsurfConnectorRouter; } });
// Replit Agent Connector Runtime (REST-based)
var replit_connector_runtime_service_1 = require("./replit-connector-runtime.service");
Object.defineProperty(exports, "ReplitConnectorRuntime", { enumerable: true, get: function () { return replit_connector_runtime_service_1.ReplitConnectorRuntime; } });
Object.defineProperty(exports, "getReplitConnectorRuntime", { enumerable: true, get: function () { return replit_connector_runtime_service_1.getReplitConnectorRuntime; } });
Object.defineProperty(exports, "resetReplitConnectorRuntime", { enumerable: true, get: function () { return replit_connector_runtime_service_1.resetReplitConnectorRuntime; } });
Object.defineProperty(exports, "getReplitConnectorIdentity", { enumerable: true, get: function () { return replit_connector_runtime_service_1.getReplitConnectorIdentity; } });
// Replit Connector Routes
var replit_connector_routes_1 = require("./replit-connector.routes");
Object.defineProperty(exports, "replitConnectorRouter", { enumerable: true, get: function () { return replit_connector_routes_1.replitConnectorRouter; } });
// Context Bridge Service
var context_bridge_service_1 = require("./context-bridge.service");
Object.defineProperty(exports, "ContextBridgeService", { enumerable: true, get: function () { return context_bridge_service_1.ContextBridgeService; } });
Object.defineProperty(exports, "getContextBridgeService", { enumerable: true, get: function () { return context_bridge_service_1.getContextBridgeService; } });
Object.defineProperty(exports, "resetContextBridgeService", { enumerable: true, get: function () { return context_bridge_service_1.resetContextBridgeService; } });
// Context Bridge Routes
var context_bridge_routes_1 = require("./context-bridge.routes");
Object.defineProperty(exports, "contextBridgeRouter", { enumerable: true, get: function () { return context_bridge_routes_1.contextBridgeRouter; } });
// A2A OpenAPI docs routes
var openapi_routes_1 = require("./openapi.routes");
Object.defineProperty(exports, "a2aOpenApiRouter", { enumerable: true, get: function () { return openapi_routes_1.a2aOpenApiRouter; } });
// A2A SLO metrics
var slo_metrics_routes_1 = require("./slo-metrics.routes");
Object.defineProperty(exports, "a2aSloMetricsRouter", { enumerable: true, get: function () { return slo_metrics_routes_1.a2aSloMetricsRouter; } });
var slo_metrics_1 = require("./slo-metrics");
Object.defineProperty(exports, "getA2ASloMetrics", { enumerable: true, get: function () { return slo_metrics_1.getA2ASloMetrics; } });
Object.defineProperty(exports, "resetA2ASloMetrics", { enumerable: true, get: function () { return slo_metrics_1.resetA2ASloMetrics; } });
// Protocol Adapters
var adapters_1 = require("./adapters");
// REST adapter
Object.defineProperty(exports, "RestAdapter", { enumerable: true, get: function () { return adapters_1.RestAdapter; } });
Object.defineProperty(exports, "buildEnvelope", { enumerable: true, get: function () { return adapters_1.buildEnvelope; } });
Object.defineProperty(exports, "registerRestAdapter", { enumerable: true, get: function () { return adapters_1.registerRestAdapter; } });
Object.defineProperty(exports, "getRestAdapter", { enumerable: true, get: function () { return adapters_1.getRestAdapter; } });
Object.defineProperty(exports, "listRestAdapters", { enumerable: true, get: function () { return adapters_1.listRestAdapters; } });
Object.defineProperty(exports, "unregisterRestAdapter", { enumerable: true, get: function () { return adapters_1.unregisterRestAdapter; } });
Object.defineProperty(exports, "resetRestAdapters", { enumerable: true, get: function () { return adapters_1.resetRestAdapters; } });
Object.defineProperty(exports, "DEFAULT_REST_ADAPTER_CONFIG", { enumerable: true, get: function () { return adapters_1.DEFAULT_REST_ADAPTER_CONFIG; } });
// Git adapter
Object.defineProperty(exports, "GitAdapter", { enumerable: true, get: function () { return adapters_1.GitAdapter; } });
Object.defineProperty(exports, "DefaultGitExecutor", { enumerable: true, get: function () { return adapters_1.DefaultGitExecutor; } });
Object.defineProperty(exports, "registerGitAdapter", { enumerable: true, get: function () { return adapters_1.registerGitAdapter; } });
Object.defineProperty(exports, "getGitAdapter", { enumerable: true, get: function () { return adapters_1.getGitAdapter; } });
Object.defineProperty(exports, "listGitAdapters", { enumerable: true, get: function () { return adapters_1.listGitAdapters; } });
Object.defineProperty(exports, "unregisterGitAdapter", { enumerable: true, get: function () { return adapters_1.unregisterGitAdapter; } });
Object.defineProperty(exports, "resetGitAdapters", { enumerable: true, get: function () { return adapters_1.resetGitAdapters; } });
Object.defineProperty(exports, "DEFAULT_GIT_ADAPTER_CONFIG", { enumerable: true, get: function () { return adapters_1.DEFAULT_GIT_ADAPTER_CONFIG; } });
// Adapter route handlers
Object.defineProperty(exports, "restAdapterRouter", { enumerable: true, get: function () { return adapters_1.restAdapterRouter; } });
Object.defineProperty(exports, "gitAdapterRouter", { enumerable: true, get: function () { return adapters_1.gitAdapterRouter; } });
// Unified Adapter Registry
Object.defineProperty(exports, "AdapterRegistry", { enumerable: true, get: function () { return adapters_1.AdapterRegistry; } });
Object.defineProperty(exports, "getAdapterRegistry", { enumerable: true, get: function () { return adapters_1.getAdapterRegistry; } });
Object.defineProperty(exports, "resetAdapterRegistry", { enumerable: true, get: function () { return adapters_1.resetAdapterRegistry; } });
// Capability Matcher
var capability_matcher_service_1 = require("./capability-matcher.service");
Object.defineProperty(exports, "CapabilityMatcherService", { enumerable: true, get: function () { return capability_matcher_service_1.CapabilityMatcherService; } });
Object.defineProperty(exports, "getCapabilityMatcher", { enumerable: true, get: function () { return capability_matcher_service_1.getCapabilityMatcher; } });
Object.defineProperty(exports, "resetCapabilityMatcher", { enumerable: true, get: function () { return capability_matcher_service_1.resetCapabilityMatcher; } });
// Task Result Aggregator
var task_result_aggregator_1 = require("./task-result-aggregator");
Object.defineProperty(exports, "TaskResultAggregator", { enumerable: true, get: function () { return task_result_aggregator_1.TaskResultAggregator; } });
Object.defineProperty(exports, "getTaskResultAggregator", { enumerable: true, get: function () { return task_result_aggregator_1.getTaskResultAggregator; } });
Object.defineProperty(exports, "resetTaskResultAggregator", { enumerable: true, get: function () { return task_result_aggregator_1.resetTaskResultAggregator; } });
// Request Validation Middleware (P17-015)
var request_validation_middleware_1 = require("./request-validation.middleware");
Object.defineProperty(exports, "validateIdParam", { enumerable: true, get: function () { return request_validation_middleware_1.validateIdParam; } });
Object.defineProperty(exports, "validateRequiredFields", { enumerable: true, get: function () { return request_validation_middleware_1.validateRequiredFields; } });
Object.defineProperty(exports, "validateOptionalFields", { enumerable: true, get: function () { return request_validation_middleware_1.validateOptionalFields; } });
Object.defineProperty(exports, "validatePaginationParams", { enumerable: true, get: function () { return request_validation_middleware_1.validatePaginationParams; } });
Object.defineProperty(exports, "validateRestAdapterConfig", { enumerable: true, get: function () { return request_validation_middleware_1.validateRestAdapterConfig; } });
Object.defineProperty(exports, "validateGitAdapterConfig", { enumerable: true, get: function () { return request_validation_middleware_1.validateGitAdapterConfig; } });
Object.defineProperty(exports, "validateExecuteBody", { enumerable: true, get: function () { return request_validation_middleware_1.validateExecuteBody; } });
Object.defineProperty(exports, "validateCapabilityMatchBody", { enumerable: true, get: function () { return request_validation_middleware_1.validateCapabilityMatchBody; } });
Object.defineProperty(exports, "validateAggregationBody", { enumerable: true, get: function () { return request_validation_middleware_1.validateAggregationBody; } });
// Rate Limiter Service (P17-016)
var rate_limiter_service_1 = require("./rate-limiter.service");
Object.defineProperty(exports, "A2ARateLimiter", { enumerable: true, get: function () { return rate_limiter_service_1.A2ARateLimiter; } });
Object.defineProperty(exports, "getA2ARateLimiter", { enumerable: true, get: function () { return rate_limiter_service_1.getA2ARateLimiter; } });
Object.defineProperty(exports, "resetA2ARateLimiter", { enumerable: true, get: function () { return rate_limiter_service_1.resetA2ARateLimiter; } });
Object.defineProperty(exports, "createRateLimitMiddleware", { enumerable: true, get: function () { return rate_limiter_service_1.createRateLimitMiddleware; } });
Object.defineProperty(exports, "DEFAULT_ADAPTER_LIMITS", { enumerable: true, get: function () { return rate_limiter_service_1.DEFAULT_ADAPTER_LIMITS; } });
Object.defineProperty(exports, "DEFAULT_AGENT_LIMITS", { enumerable: true, get: function () { return rate_limiter_service_1.DEFAULT_AGENT_LIMITS; } });
// Distributed Tracing (P17-017)
var trace_context_1 = require("./trace-context");
Object.defineProperty(exports, "A2ATraceService", { enumerable: true, get: function () { return trace_context_1.A2ATraceService; } });
Object.defineProperty(exports, "getTraceService", { enumerable: true, get: function () { return trace_context_1.getTraceService; } });
Object.defineProperty(exports, "resetTraceService", { enumerable: true, get: function () { return trace_context_1.resetTraceService; } });
// Trace Context Middleware
var trace_context_middleware_1 = require("./trace-context.middleware");
Object.defineProperty(exports, "createTraceMiddleware", { enumerable: true, get: function () { return trace_context_middleware_1.createTraceMiddleware; } });
// RBAC Service (P18-001)
var rbac_service_1 = require("./rbac.service");
Object.defineProperty(exports, "A2ARBACService", { enumerable: true, get: function () { return rbac_service_1.A2ARBACService; } });
Object.defineProperty(exports, "getA2ARBACService", { enumerable: true, get: function () { return rbac_service_1.getA2ARBACService; } });
Object.defineProperty(exports, "resetA2ARBACService", { enumerable: true, get: function () { return rbac_service_1.resetA2ARBACService; } });
Object.defineProperty(exports, "ROLE_HIERARCHY", { enumerable: true, get: function () { return rbac_service_1.ROLE_HIERARCHY; } });
// RBAC Middleware (P18-002)
var rbac_middleware_1 = require("./rbac.middleware");
Object.defineProperty(exports, "extractA2AIdentity", { enumerable: true, get: function () { return rbac_middleware_1.extractA2AIdentity; } });
Object.defineProperty(exports, "requireA2AAuth", { enumerable: true, get: function () { return rbac_middleware_1.requireA2AAuth; } });
Object.defineProperty(exports, "requireA2APermission", { enumerable: true, get: function () { return rbac_middleware_1.requireA2APermission; } });
Object.defineProperty(exports, "requireA2ARole", { enumerable: true, get: function () { return rbac_middleware_1.requireA2ARole; } });
// A2A Gateway Router (P18-003)
var gateway_router_1 = require("./gateway.router");
Object.defineProperty(exports, "createA2AGateway", { enumerable: true, get: function () { return gateway_router_1.createA2AGateway; } });
// Orchestration Patterns (P18-004/005/006)
var orchestration_1 = require("./orchestration");
// Pipeline
Object.defineProperty(exports, "PipelineOrchestrator", { enumerable: true, get: function () { return orchestration_1.PipelineOrchestrator; } });
Object.defineProperty(exports, "getPipelineOrchestrator", { enumerable: true, get: function () { return orchestration_1.getPipelineOrchestrator; } });
Object.defineProperty(exports, "resetPipelineOrchestrator", { enumerable: true, get: function () { return orchestration_1.resetPipelineOrchestrator; } });
// Scatter-Gather
Object.defineProperty(exports, "ScatterGatherOrchestrator", { enumerable: true, get: function () { return orchestration_1.ScatterGatherOrchestrator; } });
Object.defineProperty(exports, "getScatterGatherOrchestrator", { enumerable: true, get: function () { return orchestration_1.getScatterGatherOrchestrator; } });
Object.defineProperty(exports, "resetScatterGatherOrchestrator", { enumerable: true, get: function () { return orchestration_1.resetScatterGatherOrchestrator; } });
// Supervisor
Object.defineProperty(exports, "SupervisorOrchestrator", { enumerable: true, get: function () { return orchestration_1.SupervisorOrchestrator; } });
Object.defineProperty(exports, "getSupervisorOrchestrator", { enumerable: true, get: function () { return orchestration_1.getSupervisorOrchestrator; } });
Object.defineProperty(exports, "resetSupervisorOrchestrator", { enumerable: true, get: function () { return orchestration_1.resetSupervisorOrchestrator; } });
// Orchestration Routes
Object.defineProperty(exports, "orchestrationRouter", { enumerable: true, get: function () { return orchestration_1.orchestrationRouter; } });
// Task Queue Service (P18-007)
var task_queue_service_1 = require("./task-queue.service");
Object.defineProperty(exports, "A2ATaskQueue", { enumerable: true, get: function () { return task_queue_service_1.A2ATaskQueue; } });
Object.defineProperty(exports, "getA2ATaskQueue", { enumerable: true, get: function () { return task_queue_service_1.getA2ATaskQueue; } });
Object.defineProperty(exports, "resetA2ATaskQueue", { enumerable: true, get: function () { return task_queue_service_1.resetA2ATaskQueue; } });
// Task Scheduler Service (P18-008)
var task_scheduler_service_1 = require("./task-scheduler.service");
Object.defineProperty(exports, "A2ATaskScheduler", { enumerable: true, get: function () { return task_scheduler_service_1.A2ATaskScheduler; } });
Object.defineProperty(exports, "getA2ATaskScheduler", { enumerable: true, get: function () { return task_scheduler_service_1.getA2ATaskScheduler; } });
Object.defineProperty(exports, "resetA2ATaskScheduler", { enumerable: true, get: function () { return task_scheduler_service_1.resetA2ATaskScheduler; } });
// Workflow Engine (P19-001)
var workflow_engine_service_1 = require("./workflow-engine.service");
Object.defineProperty(exports, "WorkflowEngine", { enumerable: true, get: function () { return workflow_engine_service_1.WorkflowEngine; } });
Object.defineProperty(exports, "getWorkflowEngine", { enumerable: true, get: function () { return workflow_engine_service_1.getWorkflowEngine; } });
Object.defineProperty(exports, "resetWorkflowEngine", { enumerable: true, get: function () { return workflow_engine_service_1.resetWorkflowEngine; } });
// Agent-to-Agent Messaging (P19-002)
var agent_messaging_service_1 = require("./agent-messaging.service");
Object.defineProperty(exports, "AgentMessagingService", { enumerable: true, get: function () { return agent_messaging_service_1.AgentMessagingService; } });
Object.defineProperty(exports, "getAgentMessagingService", { enumerable: true, get: function () { return agent_messaging_service_1.getAgentMessagingService; } });
Object.defineProperty(exports, "resetAgentMessagingService", { enumerable: true, get: function () { return agent_messaging_service_1.resetAgentMessagingService; } });
// Delegation Chain (P19-003)
var delegation_chain_service_1 = require("./delegation-chain.service");
Object.defineProperty(exports, "DelegationChainService", { enumerable: true, get: function () { return delegation_chain_service_1.DelegationChainService; } });
Object.defineProperty(exports, "getDelegationChainService", { enumerable: true, get: function () { return delegation_chain_service_1.getDelegationChainService; } });
Object.defineProperty(exports, "resetDelegationChainService", { enumerable: true, get: function () { return delegation_chain_service_1.resetDelegationChainService; } });
// Workflow & Messaging Routes (P19-004)
var workflow_messaging_routes_1 = require("./workflow-messaging.routes");
Object.defineProperty(exports, "workflowMessagingRouter", { enumerable: true, get: function () { return workflow_messaging_routes_1.workflowMessagingRouter; } });
// Admin Management Routes (P19-005)
var admin_routes_1 = require("./admin.routes");
Object.defineProperty(exports, "adminRouter", { enumerable: true, get: function () { return admin_routes_1.adminRouter; } });
// Integration Wiring Service (P19-006)
var integration_wiring_service_1 = require("./integration-wiring.service");
Object.defineProperty(exports, "IntegrationWiringService", { enumerable: true, get: function () { return integration_wiring_service_1.IntegrationWiringService; } });
Object.defineProperty(exports, "getIntegrationWiringService", { enumerable: true, get: function () { return integration_wiring_service_1.getIntegrationWiringService; } });
Object.defineProperty(exports, "resetIntegrationWiringService", { enumerable: true, get: function () { return integration_wiring_service_1.resetIntegrationWiringService; } });
// Connector Retry Wrapper
var connector_retry_1 = require("./connector-retry");
Object.defineProperty(exports, "withConnectorRetry", { enumerable: true, get: function () { return connector_retry_1.withConnectorRetry; } });
Object.defineProperty(exports, "createRetryableExecutor", { enumerable: true, get: function () { return connector_retry_1.createRetryableExecutor; } });
Object.defineProperty(exports, "isRetryableError", { enumerable: true, get: function () { return connector_retry_1.isRetryableError; } });
