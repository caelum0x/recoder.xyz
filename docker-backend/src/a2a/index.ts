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

// Service
export {
  TaskLifecycleService,
  InMemoryTaskStore,
  getTaskLifecycleService,
  disposeTaskLifecycleService,
  resetTaskLifecycleService,
  generateId,
  type TaskStore,
  type TaskListFilter,
  type CreateTaskInput,
  type TransitionTaskInput,
  type ServiceResult,
  type AuditEventSink,
} from './task-lifecycle.service';

// Redis-backed TaskStore
export {
  RedisTaskStore,
  type RedisTaskStoreOptions,
} from './redis-task-store';

// Task timeline read-model
export {
  buildTaskTimeline,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineEventStatus,
  type TaskTimeline,
} from './task-timeline.service';

// Routes
export { taskLifecycleRouter } from './task-lifecycle.routes';

// Middleware
export {
  validateCreateTaskBody,
  validateTransitionBody,
  loadTaskEnvelope,
  parseJsonTextBody,
} from './task-lifecycle.middleware';

// AMB Collaboration Service
export {
  AMBCollaborationService,
  getCollaborationSvc,
  initCollaborationSvc,
  resetCollaborationSvc,
  parseMentions,
  type MentionEvent,
  type MentionNotifier,
  type CollaborationMessageWithMentions,
  type UpdateMessageInput,
  type MessageSearchResult,
} from './collaboration.service';

// AMB Collaboration Routes
export { collaborationRouter } from './collaboration.routes';

// AMB Collaboration Middleware
export {
  validateCreateChannelBody,
  validateCreateThreadBody,
  validateSendMessageBody,
  validateChannelIdParam,
  validateThreadIdParam,
} from './collaboration.middleware';

// Heartbeat tracker
export {
  HeartbeatTracker,
  HeartbeatEventEmitter,
  getHeartbeatTracker,
  setHeartbeatTracker,
  resetHeartbeatTracker,
  type AgentHeartbeatStatus,
  type AgentLivenessStatus,
  type HeartbeatMetadata,
  type HeartbeatRecord,
  type HealthProbeResult,
  type AgentHealthSummaryEntry,
  type HealthAggregation,
  type HeartbeatTrackerConfig,
  type HeartbeatTrackerEvents,
  type HeartbeatEventName,
  type FetchFn,
} from './heartbeat-tracker.service';

// Heartbeat routes
export { heartbeatRouter } from './heartbeat.routes';

// Agent Registry Service
export {
  AgentRegistryService,
  getAgentRegistryService,
  resetAgentRegistryService,
  DEFAULT_AGENTS,
  type RegisterAgentInput,
  type SelfRegisterInput,
  type AgentWithHealth,
  type AgentHeartbeat,
  type DefaultAgentConfig,
} from './agent-registry.service';

// Agent Registry Routes
export { agentRegistryRouter } from './agent-registry.routes';

// Agent Registry Middleware
export {
  validateRegisterBody,
  validateSelfRegisterBody,
  validateDiscoveryQuery,
} from './agent-registry.middleware';

// A2A Event Bus (pub/sub for real-time streaming)
export {
  A2AEventBus,
  A2AEventType,
  getA2AEventBus,
  resetA2AEventBus,
  TASK_EVENT_TYPES,
  TERMINAL_TASK_EVENT_TYPES,
  CHANNEL_EVENT_TYPES,
  AGENT_EVENT_TYPES,
  type A2AEvent,
  type A2AEventTypeValue,
} from './a2a-event-bus';

// A2A Event Bridge (wires audit sinks -> event bus)
export {
  wireA2AEventBridge,
  resetA2AEventBridge,
  publishChannelMessage,
  publishMessageUpdated,
  publishMessageDeleted,
  publishThreadCreated,
  publishMemberJoined,
  publishMemberLeft,
  publishAgentRegistered,
  publishAgentDeregistered,
  publishAgentOnline,
  publishAgentOffline,
} from './a2a-event-bridge';

// SSE Stream Router
export { sseStreamRouter } from './sse-stream.router';

// Claude Code MCP Connector Runtime
export {
  ClaudeConnectorRuntime,
  getClaudeConnectorRuntime,
  resetClaudeConnectorRuntime,
  getClaudeConnectorIdentity,
  type ClaudeMCPTool,
  type ClaudeConnectorStatus,
  type ClaudeConnectorConfig,
  type ClaudeConnectorState,
  type ExecuteTaskInput,
  type ExecuteTaskResult,
  type StreamChunk,
} from './claude-connector-runtime.service';

// Claude Connector Routes
export { claudeConnectorRouter } from './claude-connector.routes';

// Connector Process types
export {
  type ConnectorProcess,
  type ConnectorPlatform,
  type ConnectorHealthStatus,
  type ConnectorHealthInfo,
  type CircuitBreakerState,
  type CircuitBreakerStatus,
  type ConnectorMetrics,
  type ConnectorHealthEvents,
  type ConnectorHealthEventName,
  type ConnectorHealthMonitorConfig,
  type ConnectorHealthSummary,
  type AllConnectorsHealth,
  DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG,
} from './connector-process';

// Connector Health Monitor
export {
  ConnectorHealthMonitor,
  ConnectorHealthEventEmitter,
  getConnectorHealthMonitor,
  setConnectorHealthMonitor,
  resetConnectorHealthMonitor,
} from './connector-health-monitor.service';

// Connector Health Routes
export { connectorHealthRouter } from './connector-health.routes';

// Codex CLI Connector Runtime
export {
  CodexConnectorRuntime,
  getCodexConnectorRuntime,
  resetCodexConnectorRuntime,
  getCodexConnectorIdentity,
  type CodexConnectorStatus,
  type CodexConnectorConfig,
  type CodexConnectorState,
  type CodexExecuteInput,
  type CodexExecuteResult,
  type CodexApprovalRequest,
} from './codex-connector-runtime.service';

// Codex Connector Routes
export { codexConnectorRouter } from './codex-connector.routes';

// OpenCode Connector Runtime (experimental)
export {
  OpencodeConnectorRuntime,
  getOpencodeConnectorRuntime,
  resetOpencodeConnectorRuntime,
  getOpencodeConnectorIdentity,
  type OpencodeConnectorStatus,
  type OpencodeConnectorConfig,
  type OpencodeConnectorState,
  type OpencodeProviderKeys,
  type OpencodeExecuteInput,
  type OpencodeExecuteResult,
  type OpencodeTaskStatus,
} from './opencode-connector-runtime.service';

// OpenCode Connector Routes
export { opencodeConnectorRouter } from './opencode-connector.routes';

// Cursor IDE Connector Runtime (Tier-2)
export {
  CursorConnectorRuntime,
  getCursorConnectorRuntime,
  resetCursorConnectorRuntime,
  getCursorConnectorIdentity,
  type CursorConnectorStatus,
  type CursorConnectorConfig,
  type CursorConnectorState,
  type CursorExecuteInput,
  type CursorExecuteResult,
  type CursorStreamChunk,
} from './cursor-connector-runtime.service';

// Cursor Connector Routes
export { cursorConnectorRouter } from './cursor-connector.routes';

// Windsurf IDE Connector Runtime (Tier-2)
export {
  WindsurfConnectorRuntime,
  getWindsurfConnectorRuntime,
  resetWindsurfConnectorRuntime,
  getWindsurfConnectorIdentity,
  type WindsurfConnectorStatus,
  type WindsurfConnectorConfig,
  type WindsurfConnectorState,
  type WindsurfExecuteInput,
  type WindsurfExecuteResult,
  type WindsurfStreamChunk,
} from './windsurf-connector-runtime.service';

// Windsurf Connector Routes
export { windsurfConnectorRouter } from './windsurf-connector.routes';

// Replit Agent Connector Runtime (REST-based)
export {
  ReplitConnectorRuntime,
  getReplitConnectorRuntime,
  resetReplitConnectorRuntime,
  getReplitConnectorIdentity,
  type ReplitConnectorStatus,
  type ReplitConnectorConfig,
  type ReplitConnectorState,
  type ReplitExecuteInput,
  type ReplitExecuteResult,
} from './replit-connector-runtime.service';

// Replit Connector Routes
export { replitConnectorRouter } from './replit-connector.routes';

// Context Bridge Service
export {
  ContextBridgeService,
  getContextBridgeService,
  resetContextBridgeService,
  type ContextType,
  type ContextEntry,
  type ContextSnapshot,
} from './context-bridge.service';

// Context Bridge Routes
export { contextBridgeRouter } from './context-bridge.routes';

// A2A OpenAPI docs routes
export { a2aOpenApiRouter } from './openapi.routes';

// A2A SLO metrics
export { a2aSloMetricsRouter } from './slo-metrics.routes';
export { getA2ASloMetrics, resetA2ASloMetrics, type A2ASloSummary, type AdapterMetricsSummary } from './slo-metrics';

// Protocol Adapters
export {
  // REST adapter
  RestAdapter,
  buildEnvelope,
  registerRestAdapter,
  getRestAdapter,
  listRestAdapters,
  unregisterRestAdapter,
  resetRestAdapters,
  DEFAULT_REST_ADAPTER_CONFIG,
  type RestAuthMethod,
  type RestAdapterConfig,
  type RestAdapterResult,
  type RestAdapterHealthResult,
  type RestAdapterStatus,
  type RestAdapterState,
  type RestAdapterEvents,
  // Git adapter
  GitAdapter,
  DefaultGitExecutor,
  registerGitAdapter,
  getGitAdapter,
  listGitAdapters,
  unregisterGitAdapter,
  resetGitAdapters,
  DEFAULT_GIT_ADAPTER_CONFIG,
  type GitAuthMethod,
  type GitAdapterConfig,
  type GitTaskDescriptor,
  type GitTaskResult,
  type GitArtifact,
  type GitTaskBranch,
  type GitAdapterStatus,
  type GitAdapterState,
  type GitAdapterEvents,
  type GitAdapterCreateResult,
  type GitAdapterPollResult,
  type GitExecutor,
  // Adapter route handlers
  restAdapterRouter,
  gitAdapterRouter,
  // Unified Adapter Registry
  AdapterRegistry,
  getAdapterRegistry,
  resetAdapterRegistry,
  type AdapterType,
  type AdapterEntry,
  type AdapterHealthSummary,
  type AdapterRegistryEvents,
} from './adapters';

// Capability Matcher
export {
  CapabilityMatcherService,
  getCapabilityMatcher,
  resetCapabilityMatcher,
  type TaskRequirements,
  type AgentMatch,
  type MatchResult,
} from './capability-matcher.service';

// Task Result Aggregator
export {
  TaskResultAggregator,
  getTaskResultAggregator,
  resetTaskResultAggregator,
  type AggregationStrategy,
  type SubtaskResult,
  type AggregationInput,
  type AggregatedResult,
} from './task-result-aggregator';

// Request Validation Middleware (P17-015)
export {
  validateIdParam,
  validateRequiredFields,
  validateOptionalFields,
  validatePaginationParams,
  validateRestAdapterConfig,
  validateGitAdapterConfig,
  validateExecuteBody,
  validateCapabilityMatchBody,
  validateAggregationBody,
} from './request-validation.middleware';

// Rate Limiter Service (P17-016)
export {
  A2ARateLimiter,
  getA2ARateLimiter,
  resetA2ARateLimiter,
  createRateLimitMiddleware,
  DEFAULT_ADAPTER_LIMITS,
  DEFAULT_AGENT_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitSummary,
} from './rate-limiter.service';

// Distributed Tracing (P17-017)
export {
  A2ATraceService,
  getTraceService,
  resetTraceService,
  type TraceContext,
  type SpanOptions,
  type CompletedSpan,
} from './trace-context';

// Trace Context Middleware
export {
  createTraceMiddleware,
  type TraceMiddlewareOptions,
} from './trace-context.middleware';

// RBAC Service (P18-001)
export {
  A2ARBACService,
  getA2ARBACService,
  resetA2ARBACService,
  ROLE_HIERARCHY,
  type A2ARole,
  type A2AResource,
  type A2AAction,
  type A2APrincipal,
  type RBACPolicy,
} from './rbac.service';

// RBAC Middleware (P18-002)
export {
  extractA2AIdentity,
  requireA2AAuth,
  requireA2APermission,
  requireA2ARole,
} from './rbac.middleware';

// A2A Gateway Router (P18-003)
export {
  createA2AGateway,
  type GatewayConfig,
} from './gateway.router';

// Orchestration Patterns (P18-004/005/006)
export {
  // Pipeline
  PipelineOrchestrator,
  getPipelineOrchestrator,
  resetPipelineOrchestrator,
  type PipelineStatus,
  type PipelineStep,
  type PipelineDefinition,
  type PipelineStepResult,
  type PipelineExecution,
  // Scatter-Gather
  ScatterGatherOrchestrator,
  getScatterGatherOrchestrator,
  resetScatterGatherOrchestrator,
  type GatherStrategy,
  type ScatterGatherStatus,
  type ScatterTarget,
  type ScatterGatherDefinition,
  type ScatterResult,
  type ScatterGatherExecution,
  // Supervisor
  SupervisorOrchestrator,
  getSupervisorOrchestrator,
  resetSupervisorOrchestrator,
  type RestartPolicy,
  type ChildStatus,
  type SupervisorStatus,
  type ChildSpec,
  type ChildState,
  type SupervisorDefinition,
  type SupervisorState,
  type SupervisorEventName,
  // Orchestration Routes
  orchestrationRouter,
} from './orchestration';

// Task Queue Service (P18-007)
export {
  A2ATaskQueue,
  getA2ATaskQueue,
  resetA2ATaskQueue,
  type TaskPriority,
  type QueuedTaskStatus,
  type QueuedTask,
  type EnqueueOptions,
  type QueueStats,
  type TaskQueueEventName,
} from './task-queue.service';

// Task Scheduler Service (P18-008)
export {
  A2ATaskScheduler,
  getA2ATaskScheduler,
  resetA2ATaskScheduler,
  type ScheduleType,
  type ScheduleStatus,
  type ScheduleDefinition,
  type ScheduleExecution,
  type ScheduleState,
  type SchedulerEventName,
} from './task-scheduler.service';

// Workflow Engine (P19-001)
export {
  WorkflowEngine,
  getWorkflowEngine,
  resetWorkflowEngine,
  type WorkflowStepType,
  type WorkflowStatus,
  type WorkflowStep,
  type WorkflowTaskStep,
  type WorkflowPipelineStep,
  type WorkflowScatterGatherStep,
  type WorkflowConditionalStep,
  type WorkflowParallelStep,
  type WorkflowDefinition,
  type WorkflowStepResult,
  type WorkflowExecution,
  type WorkflowEventName,
} from './workflow-engine.service';

// Agent-to-Agent Messaging (P19-002)
export {
  AgentMessagingService,
  getAgentMessagingService,
  resetAgentMessagingService,
  type MessageType,
  type DeliveryStatus,
  type AgentMessage,
  type SendMessageInput,
  type InboxQuery,
  type ConversationThread,
  type MessagingStats,
  type MessagingEventName,
} from './agent-messaging.service';

// Delegation Chain (P19-003)
export {
  DelegationChainService,
  getDelegationChainService,
  resetDelegationChainService,
  type DelegationStatus,
  type DelegationRequest,
  type DelegateInput,
  type DelegationChain,
  type DelegationStats,
  type DelegationConfig,
  type DelegationEventName,
} from './delegation-chain.service';

// Workflow & Messaging Routes (P19-004)
export { workflowMessagingRouter } from './workflow-messaging.routes';

// Admin Management Routes (P19-005)
export { adminRouter } from './admin.routes';

// Integration Wiring Service (P19-006)
export {
  IntegrationWiringService,
  getIntegrationWiringService,
  resetIntegrationWiringService,
  type WiringConfig,
  type WiringStats,
  type WiringEventName,
} from './integration-wiring.service';

// Connector Retry Wrapper
export {
  withConnectorRetry,
  createRetryableExecutor,
  isRetryableError,
  type RetryConfig,
} from './connector-retry';
