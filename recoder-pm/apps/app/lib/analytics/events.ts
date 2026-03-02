/**
 * PM Product Analytics Event Taxonomy
 *
 * Single source of truth for every tracked product event in recoder-pm.
 * Events are grouped by funnel stage (task lifecycle, connector interop,
 * approval workflow) so dashboards can be built directly from these constants.
 */

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

export const PmEvents = {
  // ---- Task / Feature lifecycle funnel ----
  FEATURE_CREATED: "pm_feature_created",
  FEATURE_UPDATED: "pm_feature_updated",
  FEATURE_DELETED: "pm_feature_deleted",
  FEATURE_STATUS_CHANGED: "pm_feature_status_changed",
  FEATURE_DELEGATED: "pm_feature_delegated",
  FEATURE_COMPLETED: "pm_feature_completed",

  // ---- Initiative lifecycle ----
  INITIATIVE_CREATED: "pm_initiative_created",
  INITIATIVE_UPDATED: "pm_initiative_updated",

  // ---- Feedback lifecycle ----
  FEEDBACK_CREATED: "pm_feedback_created",

  // ---- Connector / Integration events ----
  CONNECTOR_SELECTED: "pm_connector_selected",
  CONNECTOR_CONFIGURED: "pm_connector_configured",
  CONNECTOR_REMOVED: "pm_connector_removed",
  CONNECTOR_SYNCED: "pm_connector_synced",

  // ---- Approval workflow ----
  APPROVAL_REQUESTED: "pm_approval_requested",
  APPROVAL_GRANTED: "pm_approval_granted",
  APPROVAL_REJECTED: "pm_approval_rejected",

  // ---- Interop (A2A / cross-service) ----
  CONNECTOR_INVOKED: "pm_connector_invoked",
  CONNECTOR_RESPONSE: "pm_connector_response",
  CONNECTOR_ERROR: "pm_connector_error",

  // ---- Page views / engagement ----
  DASHBOARD_VIEWED: "pm_dashboard_viewed",
  INSIGHTS_VIEWED: "pm_insights_viewed",
} as const;

export type PmEvent = (typeof PmEvents)[keyof typeof PmEvents];

// ---------------------------------------------------------------------------
// Per-event property schemas
// ---------------------------------------------------------------------------

/** Properties common to every PM event. */
export interface PmBaseEventProperties {
  /** Authenticated user ID. */
  userId?: string;
  /** Organization ID for the current workspace. */
  organizationId?: string;
  /** Trace ID for correlating events across services. */
  traceId?: string;
  /** ISO-8601 timestamp; auto-filled by the tracker when omitted. */
  timestamp?: string;
}

/** Task / feature lifecycle properties. */
export interface PmFeatureEventProperties extends PmBaseEventProperties {
  featureId?: string;
  title?: string;
  assigneeId?: string;
  productId?: string;
  groupId?: string;
  statusId?: string;
  previousStatusId?: string;
}

/** Initiative lifecycle properties. */
export interface PmInitiativeEventProperties extends PmBaseEventProperties {
  initiativeId?: string;
  title?: string;
  ownerId?: string;
}

/** Feedback lifecycle properties. */
export interface PmFeedbackEventProperties extends PmBaseEventProperties {
  feedbackId?: string;
  title?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

/** Connector / integration properties. */
export interface PmConnectorEventProperties extends PmBaseEventProperties {
  connectorId?: string;
  connectorType?: string;
  provider?: string;
}

/** Approval workflow properties. */
export interface PmApprovalEventProperties extends PmBaseEventProperties {
  approvalId?: string;
  featureId?: string;
  requestedBy?: string;
  resolvedBy?: string;
}

/** Interop (A2A) properties. All include connector_id for cross-service correlation. */
export interface PmInteropEventProperties extends PmBaseEventProperties {
  /** Connector identifier for the external service being invoked. */
  connector_id: string;
  intent?: string;
  messageId?: string;
  threadId?: string;
  targetUrl?: string;
  fromPlatform?: string;
  toPlatform?: string;
  /** HTTP status code from the remote service. */
  responseStatus?: number;
  /** Error message if the invocation failed. */
  errorMessage?: string;
  /** Duration of the remote call in milliseconds. */
  durationMs?: number;
}

/** Page view / engagement properties. */
export interface PmPageViewEventProperties extends PmBaseEventProperties {
  pagePath?: string;
  pageTitle?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union mapping events -> their property types
// ---------------------------------------------------------------------------

export type PmEventPropertiesMap = {
  // Task / Feature lifecycle
  [PmEvents.FEATURE_CREATED]: PmFeatureEventProperties;
  [PmEvents.FEATURE_UPDATED]: PmFeatureEventProperties;
  [PmEvents.FEATURE_DELETED]: PmFeatureEventProperties;
  [PmEvents.FEATURE_STATUS_CHANGED]: PmFeatureEventProperties;
  [PmEvents.FEATURE_DELEGATED]: PmFeatureEventProperties;
  [PmEvents.FEATURE_COMPLETED]: PmFeatureEventProperties;

  // Initiative lifecycle
  [PmEvents.INITIATIVE_CREATED]: PmInitiativeEventProperties;
  [PmEvents.INITIATIVE_UPDATED]: PmInitiativeEventProperties;

  // Feedback lifecycle
  [PmEvents.FEEDBACK_CREATED]: PmFeedbackEventProperties;

  // Connector / Integration
  [PmEvents.CONNECTOR_SELECTED]: PmConnectorEventProperties;
  [PmEvents.CONNECTOR_CONFIGURED]: PmConnectorEventProperties;
  [PmEvents.CONNECTOR_REMOVED]: PmConnectorEventProperties;
  [PmEvents.CONNECTOR_SYNCED]: PmConnectorEventProperties;

  // Approval workflow
  [PmEvents.APPROVAL_REQUESTED]: PmApprovalEventProperties;
  [PmEvents.APPROVAL_GRANTED]: PmApprovalEventProperties;
  [PmEvents.APPROVAL_REJECTED]: PmApprovalEventProperties;

  // Interop (A2A)
  [PmEvents.CONNECTOR_INVOKED]: PmInteropEventProperties;
  [PmEvents.CONNECTOR_RESPONSE]: PmInteropEventProperties;
  [PmEvents.CONNECTOR_ERROR]: PmInteropEventProperties;

  // Page views
  [PmEvents.DASHBOARD_VIEWED]: PmPageViewEventProperties;
  [PmEvents.INSIGHTS_VIEWED]: PmPageViewEventProperties;
};
