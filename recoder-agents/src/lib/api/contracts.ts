import { z } from 'zod';

export const healthCheckResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  instance_id: z.string(),
});

const notificationSettingsSchema = z.object({
  user_id: z.string(),
  email_enabled: z.boolean(),
  push_enabled: z.boolean(),
  in_app_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  task_notifications: z.boolean(),
  billing_notifications: z.boolean(),
  promotional_notifications: z.boolean(),
  system_notifications: z.boolean(),
  quiet_hours_enabled: z.boolean(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
  timezone: z.string(),
});

const notificationLogSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  event_type: z.string(),
  channel: z.string(),
  status: z.string(),
  novu_transaction_id: z.string().optional(),
  error_message: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  created_at: z.string(),
});

export const notificationSettingsResponseSchema = z.object({
  settings: notificationSettingsSchema,
});

export const notificationLogsResponseSchema = z.object({
  logs: z.array(notificationLogSchema),
});

export function parseHealthCheckResponse(payload: unknown) {
  return healthCheckResponseSchema.parse(payload);
}

export function parseNotificationSettingsResponse(payload: unknown) {
  return notificationSettingsResponseSchema.parse(payload);
}

export function parseNotificationLogsResponse(payload: unknown) {
  return notificationLogsResponseSchema.parse(payload);
}

const billingModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  allowed: z.boolean(),
  context_window: z.number(),
  capabilities: z.array(z.string()),
  priority: z.number(),
  recommended: z.boolean(),
});

const billingLimitLeafSchema = z.object({
  current: z.number().optional(),
  current_count: z.number().optional(),
  running_count: z.number().optional(),
  max: z.number().optional(),
  limit: z.number().optional(),
  can_create: z.boolean().optional(),
  can_start: z.boolean().optional(),
  tier_name: z.string().optional(),
}).passthrough();

const billingAccountStateSchema = z.object({
  credits: z.object({
    total: z.number(),
    daily: z.number(),
    monthly: z.number(),
    extra: z.number(),
    can_run: z.boolean(),
    daily_refresh: z
      .object({
        enabled: z.boolean(),
        daily_amount: z.number(),
        refresh_interval_hours: z.number(),
        last_refresh: z.string().optional(),
        next_refresh_at: z.string().optional(),
        seconds_until_refresh: z.number().optional(),
      })
      .nullable(),
  }),
  subscription: z
    .object({
      tier_key: z.string(),
      tier_display_name: z.string(),
      status: z.string(),
      billing_period: z.string().nullable(),
      provider: z.string(),
      subscription_id: z.string().nullable(),
      current_period_end: z.number().nullable(),
      cancel_at_period_end: z.boolean(),
      is_trial: z.boolean(),
      trial_status: z.string().nullable(),
      trial_ends_at: z.string().nullable(),
      is_cancelled: z.boolean(),
      cancellation_effective_date: z.string().nullable(),
      has_scheduled_change: z.boolean(),
      scheduled_change: z.unknown().nullable(),
      commitment: z
        .object({
          has_commitment: z.boolean(),
          can_cancel: z.boolean(),
        })
        .passthrough(),
      can_purchase_credits: z.boolean(),
    })
    .passthrough(),
  models: z.array(billingModelSchema),
  limits: z
    .object({
      projects: billingLimitLeafSchema,
      threads: billingLimitLeafSchema,
      concurrent_runs: billingLimitLeafSchema,
      ai_worker_count: billingLimitLeafSchema,
      custom_mcp_count: billingLimitLeafSchema,
      trigger_count: z
        .object({
          scheduled: billingLimitLeafSchema,
          app: billingLimitLeafSchema,
          tier_name: z.string(),
        })
        .passthrough(),
    })
    .passthrough(),
  tier: z.object({
    name: z.string(),
    display_name: z.string(),
    monthly_credits: z.number(),
    can_purchase_credits: z.boolean(),
  }),
})
  .passthrough();

const createCheckoutSessionResponseSchema = z
  .object({
    status: z
      .enum([
        'upgraded',
        'downgrade_scheduled',
        'checkout_created',
        'no_change',
        'new',
        'updated',
        'scheduled',
        'commitment_created',
        'commitment_blocks_downgrade',
      ])
      .optional(),
    subscription_id: z.string().optional(),
    schedule_id: z.string().optional(),
    session_id: z.string().optional(),
    url: z.string().optional(),
    checkout_url: z.string().optional(),
    effective_date: z.string().optional(),
    scheduled_date: z.string().optional(),
    current_tier: z.string().optional(),
    target_tier: z.string().optional(),
    message: z.string().optional(),
    redirect_to_dashboard: z.boolean().optional(),
    success: z.boolean().optional(),
    details: z.unknown().optional(),
  })
  .passthrough();

const createPortalSessionResponseSchema = z.object({
  portal_url: z.string(),
});

const checkoutSessionDetailsSchema = z.object({
  session_id: z.string(),
  amount_total: z.number(),
  amount_subtotal: z.number(),
  amount_discount: z.number(),
  amount_tax: z.number(),
  currency: z.string(),
  coupon_id: z.string().nullable(),
  coupon_name: z.string().nullable(),
  promotion_code: z.string().nullable(),
  balance_transaction_id: z.string().nullable(),
  status: z.string(),
  payment_status: z.string(),
});

const createInlineCheckoutResponseSchema = z
  .object({
    client_secret: z.string().optional(),
    subscription_id: z.string(),
    tier_key: z.string(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    no_payment_required: z.boolean().optional(),
    upgraded: z.boolean().optional(),
    previous_tier: z.string().optional(),
    credits_granted: z.number().optional(),
    message: z.string().optional(),
  })
  .passthrough();

const confirmInlineCheckoutResponseSchema = z.object({
  success: z.boolean(),
  tier: z.string(),
  message: z.string(),
});

export function parseBillingAccountState(payload: unknown) {
  return billingAccountStateSchema.parse(payload);
}

export function parseCreateCheckoutSessionResponse(payload: unknown) {
  return createCheckoutSessionResponseSchema.parse(payload);
}

export function parseCreatePortalSessionResponse(payload: unknown) {
  return createPortalSessionResponseSchema.parse(payload);
}

export function parseCheckoutSessionDetails(payload: unknown) {
  return checkoutSessionDetailsSchema.parse(payload);
}

export function parseCreateInlineCheckoutResponse(payload: unknown) {
  return createInlineCheckoutResponseSchema.parse(payload);
}

export function parseConfirmInlineCheckoutResponse(payload: unknown) {
  return confirmInlineCheckoutResponseSchema.parse(payload);
}

const apiMessageSchema = z.object({
  message_id: z.string().optional(),
  thread_id: z.string().optional(),
  type: z.string(),
  is_llm_message: z.boolean().optional(),
  content: z.unknown().optional(),
  metadata: z.unknown().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  agent_id: z.string().nullable().optional(),
  agent_run_id: z.string().nullable().optional(),
  agent_version_id: z.string().nullable().optional(),
  // Legacy fields (may appear in older responses or agent runs)
  role: z.string().optional(),
  agents: z.object({ name: z.string() }).optional(),
});

const agentRunSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  status: z.enum(['running', 'completed', 'stopped', 'error']),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  responses: z.array(apiMessageSchema).default([]),
  error: z.string().nullable(),
});

const unifiedAgentStartResponseSchema = z.object({
  thread_id: z.string(),
  agent_run_id: z.string(),
  status: z.string(),
  project_id: z.string().nullable().optional(),
  sandbox_id: z.string().nullable().optional(),
});

const optimisticAgentStartResponseSchema = z.object({
  thread_id: z.string(),
  project_id: z.string(),
  agent_run_id: z.string().nullable(),
  sandbox_id: z.string().nullable().optional(),
  status: z.enum(['pending', 'running']),
});

const activeAgentRunSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  status: z.literal('running'),
  started_at: z.string(),
});

const activeAgentRunsResponseSchema = z.object({
  active_runs: z.array(activeAgentRunSchema),
});

const agentRunsResponseSchema = z.object({
  agent_runs: z.array(agentRunSchema),
});

const projectResponseSchema = z.object({
  project_id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  sandbox: z.unknown().optional(),
  is_public: z.boolean().optional(),
  icon_name: z.string().nullable().optional(),
});

const threadSchema = z
  .object({
    thread_id: z.string(),
    project_id: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    metadata: z.record(z.unknown()).optional(),
    project: z.unknown().optional(),
  })
  .passthrough();

const threadsPaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});

const threadsResponseSchema = z.object({
  threads: z.array(threadSchema),
  pagination: threadsPaginationSchema.optional(),
});

const threadSearchResultSchema = z.object({
  thread_id: z.string(),
  score: z.number(),
  text_preview: z.string(),
  project_id: z.string().nullable(),
  project_name: z.string(),
  project_icon_name: z.string().nullable(),
  updated_at: z.string().nullable(),
});

const threadSearchResponseSchema = z.object({
  results: z.array(threadSearchResultSchema),
  total: z.number(),
  configured: z.boolean(),
});

const createThreadResponseSchema = z.object({
  thread_id: z.string(),
  project_id: z.string(),
});

const messagesResponseSchema = z.object({
  messages: z.array(apiMessageSchema),
});

const sandboxFileInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  is_dir: z.boolean(),
  size: z.number(),
  mod_time: z.string(),
  permissions: z.string().optional(),
});

const sandboxFilesResponseSchema = z.object({
  files: z.array(sandboxFileInfoSchema),
});

export function parseUnifiedAgentStartResponse(payload: unknown) {
  return unifiedAgentStartResponseSchema.parse(payload);
}

export function parseOptimisticAgentStartResponse(payload: unknown) {
  return optimisticAgentStartResponseSchema.parse(payload);
}

export function parseAgentRun(payload: unknown) {
  return agentRunSchema.parse(payload);
}

export function parseAgentRunsResponse(payload: unknown) {
  return agentRunsResponseSchema.parse(payload);
}

export function parseActiveAgentRunsResponse(payload: unknown) {
  return activeAgentRunsResponseSchema.parse(payload);
}

export function parseProjectResponse(payload: unknown) {
  return projectResponseSchema.parse(payload);
}

export function parseThreadsResponse(payload: unknown) {
  return threadsResponseSchema.parse(payload);
}

export function parseThreadSearchResponse(payload: unknown) {
  return threadSearchResponseSchema.parse(payload);
}

export function parseSandboxFilesResponse(payload: unknown) {
  return sandboxFilesResponseSchema.parse(payload);
}

export function parseCreateThreadResponse(payload: unknown) {
  return createThreadResponseSchema.parse(payload);
}

export function parseMessagesResponse(payload: unknown) {
  return messagesResponseSchema.parse(payload);
}

const memorySchema = z.object({
  memory_id: z.string(),
  content: z.string(),
  memory_type: z.enum(['fact', 'preference', 'context', 'conversation_summary']),
  confidence_score: z.number(),
  source_thread_id: z.string().optional(),
  metadata: z.record(z.unknown()),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const memoryListResponseSchema = z.object({
  memories: z.array(memorySchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  pages: z.number(),
});

const memoryStatsResponseSchema = z.object({
  total_memories: z.number(),
  memories_by_type: z.record(z.number()),
  oldest_memory: z.string().optional(),
  newest_memory: z.string().optional(),
  max_memories: z.number(),
  retrieval_limit: z.number(),
  tier_name: z.string(),
  memory_enabled: z.boolean(),
});

const deleteMemoryResponseSchema = z.object({
  message: z.string(),
  memory_id: z.string(),
});

const deleteAllMemoriesResponseSchema = z.object({
  message: z.string(),
  deleted_count: z.number(),
});

const memorySettingsResponseSchema = z.object({
  memory_enabled: z.boolean(),
});

const threadMemorySettingsResponseSchema = z.object({
  thread_id: z.string(),
  memory_enabled: z.boolean(),
});

const referralCodeResponseSchema = z.object({
  referral_code: z.string(),
  referral_url: z.string(),
});

const referralStatsResponseSchema = z.object({
  referral_code: z.string(),
  total_referrals: z.number(),
  successful_referrals: z.number(),
  total_credits_earned: z.number(),
  last_referral_at: z.string().nullable(),
  remaining_earnable_credits: z.number(),
  max_earnable_credits: z.number(),
  has_reached_limit: z.boolean(),
});

const referralResponseSchema = z.object({
  id: z.string(),
  referred_account_id: z.string(),
  credits_awarded: z.number(),
  status: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

const referralListResponseSchema = z.object({
  referrals: z.array(referralResponseSchema),
  total_count: z.number(),
});

const validateReferralCodeResponseSchema = z.object({
  valid: z.boolean(),
  referrer_id: z.string().optional(),
  message: z.string().optional(),
});

const referralEmailResultSchema = z.object({
  email: z.string(),
  success: z.boolean(),
  message: z.string().optional(),
});

const referralEmailResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  results: z.array(referralEmailResultSchema).optional(),
  success_count: z.number().optional(),
  total_count: z.number().optional(),
});

const transcriptionResponseSchema = z.object({
  text: z.string(),
});

export function parseMemory(payload: unknown) {
  return memorySchema.parse(payload);
}

export function parseMemoryListResponse(payload: unknown) {
  return memoryListResponseSchema.parse(payload);
}

export function parseMemoryStatsResponse(payload: unknown) {
  return memoryStatsResponseSchema.parse(payload);
}

export function parseDeleteMemoryResponse(payload: unknown) {
  return deleteMemoryResponseSchema.parse(payload);
}

export function parseDeleteAllMemoriesResponse(payload: unknown) {
  return deleteAllMemoriesResponseSchema.parse(payload);
}

export function parseMemorySettingsResponse(payload: unknown) {
  return memorySettingsResponseSchema.parse(payload);
}

export function parseThreadMemorySettingsResponse(payload: unknown) {
  return threadMemorySettingsResponseSchema.parse(payload);
}

export function parseReferralCodeResponse(payload: unknown) {
  return referralCodeResponseSchema.parse(payload);
}

export function parseReferralStatsResponse(payload: unknown) {
  return referralStatsResponseSchema.parse(payload);
}

export function parseReferralListResponse(payload: unknown) {
  return referralListResponseSchema.parse(payload);
}

export function parseValidateReferralCodeResponse(payload: unknown) {
  return validateReferralCodeResponseSchema.parse(payload);
}

export function parseReferralEmailResponse(payload: unknown) {
  return referralEmailResponseSchema.parse(payload);
}

export function parseTranscriptionResponse(payload: unknown) {
  return transcriptionResponseSchema.parse(payload);
}
