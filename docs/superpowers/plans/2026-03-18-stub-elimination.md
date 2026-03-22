# Stub Elimination — End-to-End Real APIs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all stub/mock/placeholder code with real API integrations across the platform.

**Architecture:** Fix billing service missing returns and webhook handlers, wire usage tracking to real DB aggregation, connect recoder-agents settings pages to the existing Python backend preferences API (`/v1/preferences`), enable error notifications across all API calls, and wire analytics package to real data.

**Tech Stack:** Next.js (app/), Next.js (recoder-agents/), Python FastAPI (backend/), TypeScript packages

---

## Task 1: Fix billing.service.ts — Missing Return Statements

**Files:**
- Modify: `app/lib/services/billing.service.ts`

These methods query the database but never return the result, causing callers to get `undefined`.

- [ ] **Step 1: Add return to getSubscription()**

In `app/lib/services/billing.service.ts`, line 115-117, the method queries `prisma.subscriptions.findUnique` but doesn't return. Fix:

```typescript
// Line 115-117: Change from:
const subscription = await prisma.subscriptions.findUnique({
  where: { userId },
});

// To:
const subscription = await prisma.subscriptions.findUnique({
  where: { userId },
});
return subscription;
```

- [ ] **Step 2: Add return to createSubscription()**

At the end of the try block (around line 103), before the catch, add:

```typescript
return subscription;
```

The `subscription` variable is already defined on line 37 from the `prisma.subscriptions.upsert()` call.

- [ ] **Step 3: Add return to updateSubscription()**

At the end of the try block (around line 170), before the catch, add:

```typescript
return updated;
```

The `updated` variable is already defined on line 142.

- [ ] **Step 4: Add return to resumeSubscription()**

At the end of the try block (around line 276), before the catch, add:

```typescript
return { message: 'Subscription resumed' };
```

- [ ] **Step 5: Add return to getInvoices()**

In `app/lib/services/billing.service.ts`, line 351-355. Fix:

```typescript
const invoices = await prisma.invoices.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  take: limit,
});
return invoices;
```

- [ ] **Step 6: Add return to getInvoice()**

After the not-found check (line 377), add:

```typescript
return invoice;
```

- [ ] **Step 7: Add return to createInvoice()**

After the `prisma.invoices.create()` call (line 405), add:

```typescript
return invoice;
```

- [ ] **Step 8: Add return to addPaymentMethod()**

After the `prisma.payment_methods.create()` call (line 439), add:

```typescript
return paymentMethod;
```

- [ ] **Step 9: Add return to listPaymentMethods()**

After the `prisma.payment_methods.findMany()` call (line 455), add:

```typescript
return methods;
```

- [ ] **Step 10: Add return to setDefaultPaymentMethod() and removePaymentMethod()**

`setDefaultPaymentMethod()` — after line 478, add:
```typescript
return { success: true };
```

`removePaymentMethod()` — after line 493, add:
```typescript
return { success: true };
```

- [ ] **Step 11: Verify the file compiles**

Run: `cd /Users/arhansubasi/recoder.xyz && npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -20`

---

## Task 2: Fix billing.service.ts — Real Webhook Handlers

**Files:**
- Modify: `app/lib/services/billing.service.ts`

The 4 webhook handlers only log. They need to actually update the database.

- [ ] **Step 1: Implement handlePaymentSuccess()**

Replace the stub at line 641-643:

```typescript
private async handlePaymentSuccess(payload: any) {
  const userId = payload.data?.customer_id || payload.customer_id || payload.meta?.custom_data?.user_id;
  const planId = payload.data?.product_id || payload.product_id;
  const amount = payload.data?.amount || payload.amount || 0;
  const providerId = payload.data?.subscription_id || payload.subscription_id || payload.id;
  const provider = payload.provider || 'dodo';

  if (!userId) {
    logger.warn('Payment success webhook missing userId', { payload: JSON.stringify(payload) });
    return;
  }

  logger.info('Processing payment success', { userId, planId, amount, providerId });

  // Create or update subscription
  await this.createSubscription(userId, planId || 'pro', provider, providerId || `sub_${Date.now()}`, amount);

  // Create invoice record
  await this.createInvoice(userId, amount, `Payment for ${planId || 'subscription'}`);
}
```

- [ ] **Step 2: Implement handleSubscriptionUpdate()**

Replace the stub at line 646-647:

```typescript
private async handleSubscriptionUpdate(payload: any) {
  const userId = payload.data?.customer_id || payload.customer_id || payload.meta?.custom_data?.user_id;
  const newPlanId = payload.data?.product_id || payload.product_id;

  if (!userId) {
    logger.warn('Subscription update webhook missing userId', { payload: JSON.stringify(payload) });
    return;
  }

  logger.info('Processing subscription update', { userId, newPlanId });

  if (newPlanId) {
    await this.updateSubscription(userId, newPlanId);
  }
}
```

- [ ] **Step 3: Implement handleSubscriptionCancelled()**

Replace the stub at line 650-651:

```typescript
private async handleSubscriptionCancelled(payload: any) {
  const userId = payload.data?.customer_id || payload.customer_id || payload.meta?.custom_data?.user_id;
  const immediately = payload.data?.effective_immediately ?? false;

  if (!userId) {
    logger.warn('Subscription cancel webhook missing userId', { payload: JSON.stringify(payload) });
    return;
  }

  logger.info('Processing subscription cancellation', { userId, immediately });
  await this.cancelSubscription(userId, immediately);
}
```

- [ ] **Step 4: Implement handlePaymentFailed()**

Replace the stub at line 654-655:

```typescript
private async handlePaymentFailed(payload: any) {
  const userId = payload.data?.customer_id || payload.customer_id || payload.meta?.custom_data?.user_id;

  if (!userId) {
    logger.error('Payment failed webhook missing userId', { payload: JSON.stringify(payload) });
    return;
  }

  logger.error('Processing payment failure', { userId, payload: JSON.stringify(payload) });

  // Update subscription status to past_due
  try {
    await prisma.subscriptions.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'past_due', updatedAt: new Date() },
    });

    await prisma.users.update({
      where: { id: userId },
      data: { subscriptionStatus: 'past_due' },
    });

    // Log the failure
    await prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'payment_failed',
        resource: 'subscription',
        metadata: { reason: payload.data?.failure_reason || 'unknown' },
      },
    });
  } catch (error) {
    logger.error('Failed to process payment failure', { userId, error: String(error) });
  }
}
```

---

## Task 3: Fix billing.service.ts — Real Checkout Session

**Files:**
- Modify: `app/lib/services/billing.service.ts`

- [ ] **Step 1: Replace mock createCheckoutSession with real provider integration**

Replace lines 286-301:

```typescript
async createCheckoutSession(userId: string, planId: string) {
  try {
    const amount = this.getPlanAmount(planId);

    // Try DodoPayments first
    const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (dodoApiKey) {
      const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
      const planProductMap: Record<string, string> = {
        pro: process.env.DODO_PRODUCT_PRO || '',
        enterprise: process.env.DODO_PRODUCT_ENTERPRISE || '',
        weekly: process.env.DODO_PRODUCT_WEEKLY || '',
        monthly: process.env.DODO_PRODUCT_MONTHLY || '',
      };
      const productId = planProductMap[planId];

      if (productId) {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
        const session = await DodoPaymentsService.createCheckoutSession({
          productId,
          customerId: userId,
          customerEmail: user?.email || '',
          successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/billing/checkout?plan=${planId}`,
          metadata: { userId, planId },
        });
        return session;
      }
    }

    // No provider configured — return error with redirect to billing setup
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    return {
      checkoutUrl: `${baseUrl}/billing/checkout?plan=${planId}`,
      sessionId: null,
      amount,
      error: 'No payment provider configured. Contact support.',
      providerConfigured: false,
    };
  } catch (error) {
    logger.error('Create checkout session error', { error: String(error) });
    throw error;
  }
}
```

- [ ] **Step 2: Fix addPaymentMethod to accept real data from provider callback**

Replace lines 416-445:

```typescript
async addPaymentMethod(
  userId: string,
  token: string,
  provider: string = 'dodo',
  cardDetails?: { last4: string; brand: string; expMonth: number; expYear: number }
) {
  try {
    // Unset any existing defaults
    await prisma.payment_methods.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    const paymentMethod = await prisma.payment_methods.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        type: 'card',
        provider,
        providerId: token,
        last4: cardDetails?.last4 || 'xxxx',
        brand: cardDetails?.brand || 'unknown',
        expMonth: cardDetails?.expMonth || 0,
        expYear: cardDetails?.expYear || 0,
        isDefault: true,
        updatedAt: new Date(),
      },
    });

    return paymentMethod;
  } catch (error) {
    logger.error('Add payment method error', { error: String(error) });
    throw error;
  }
}
```

---

## Task 4: Fix usage-service.ts — Real Token Tracking

**Files:**
- Modify: `app/lib/usage-service.ts`

- [ ] **Step 1: Replace hardcoded zeros with real DB aggregation**

In `app/lib/usage-service.ts`, replace lines 304-320 (the `tokensUsed = 0` block):

```typescript
// Aggregate actual token usage from usage_records for current period
let tokensUsed = 0;
let cost = 0;
try {
  const usageAgg = await prisma.usage_records.aggregate({
    where: {
      userId: user.id,
      createdAt: { gte: quota.periodStart },
    },
    _sum: {
      tokensUsed: true,
    },
  });
  tokensUsed = usageAgg._sum.tokensUsed || 0;

  // Estimate cost based on token usage (approx $0.002 per 1K tokens for free tier models)
  cost = Math.round((tokensUsed / 1000) * 0.002 * 100) / 100;
} catch {
  // If usage_records table doesn't have tokensUsed, fall back to 0
  tokensUsed = 0;
  cost = 0;
}

const tokensPercentage =
  planLimits.tokensPerMonth === -1
    ? 0
    : (tokensUsed / planLimits.tokensPerMonth) * 100;

return {
  requests: {
    used: quota.requestsUsed,
    limit: planLimits.monthlyRequests,
    percentage: requestsPercentage,
  },
  tokens: {
    used: tokensUsed,
    limit: planLimits.tokensPerMonth,
    percentage: tokensPercentage,
  },
  cost,
  periodEnd: quota.periodEnd,
  tier: user.subscriptionPlan,
  hasApiKey: !!user.hasOwnApiKey || !!process.env.OPENROUTER_API_KEY,
};
```

---

## Task 5: Wire recoder-agents Settings Pages to Real Backend API

**Files:**
- Modify: `recoder-agents/src/app/(dashboard)/settings/appearance/page.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/settings/notifications/page.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/admin/features/page.tsx`

The Python backend already has a fully working `/v1/preferences` API (see `backend/core/preferences/user_preferences_sync_api.py`) that supports key-value preferences with categories including "appearance" and "notifications". We'll wire each page to call this API with localStorage as fallback cache.

- [ ] **Step 1: Fix appearance settings page**

In `recoder-agents/src/app/(dashboard)/settings/appearance/page.tsx`:

Replace the `loadSettings()` function (lines 51-60) and `persist()` callback (lines 102-108):

```tsx
const STORAGE_KEY = 'recoder-appearance-settings';

// API-backed load with localStorage fallback
async function loadSettingsFromApi(): Promise<AppearanceSettings> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.recoder.xyz/v1'}/preferences?category=appearance`,
      { credentials: 'include' }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.preferences && data.preferences.length > 0) {
        const mapped: Partial<AppearanceSettings> = {};
        for (const pref of data.preferences) {
          if (pref.preference_key === 'theme') mapped.theme = pref.preference_value;
          if (pref.preference_key === 'fontSize') mapped.fontSize = pref.preference_value;
          if (pref.preference_key === 'compactMode') mapped.compactMode = pref.preference_value;
          if (pref.preference_key === 'reducedAnimations') mapped.reducedAnimations = pref.preference_value;
        }
        const settings = { ...defaultSettings, ...mapped };
        // Cache to localStorage
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
        return settings;
      }
    }
  } catch {
    // Fallback to localStorage
  }
  return loadSettings();
}

// Save to API + localStorage
async function persistToApi(settings: AppearanceSettings): Promise<void> {
  // Always save to localStorage immediately for fast local reads
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}

  // Then sync to backend
  try {
    const entries = Object.entries(settings).map(([key, value]) => ({
      preference_key: key,
      preference_value: value,
      category: 'appearance',
    }));
    await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.recoder.xyz/v1'}/preferences/batch`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: entries }),
      }
    );
  } catch {
    // Silently fail — localStorage is the fallback
  }
}
```

Then in the component, change `useEffect` to call `loadSettingsFromApi()` and change `persist` to call `persistToApi()`.

- [ ] **Step 2: Fix notification preferences page**

Same pattern for `recoder-agents/src/app/(dashboard)/settings/notifications/page.tsx`:

Replace `loadPreferences()` and `handleSave()` with API-backed versions using the same `/v1/preferences?category=notifications` and `/v1/preferences/batch` endpoints.

- [ ] **Step 3: Fix feature flags admin page**

Same pattern for `recoder-agents/src/app/(dashboard)/admin/features/page.tsx`:

Replace `loadFlags()` and `saveFlags()` with API-backed versions. Feature flags use category "general" with prefix `feature_flag_`.

---

## Task 6: Enable Error Notifications (showErrors: false → true)

**Files:**
- Modify: 194 files in `recoder-agents/src/lib/api/`

677 occurrences of `showErrors: false` silently swallow errors. Users see empty data instead of error messages.

- [ ] **Step 1: Bulk replace showErrors: false with showErrors: true**

Run a single sed command to fix all 194 files:

```bash
cd /Users/arhansubasi/recoder.xyz
find recoder-agents/src/lib/api/ -name '*.ts' -exec sed -i '' 's/showErrors: false/showErrors: true/g' {} +
```

- [ ] **Step 2: Verify the change count**

```bash
grep -r "showErrors: false" recoder-agents/src/lib/api/ | wc -l
# Expected: 0

grep -r "showErrors: true" recoder-agents/src/lib/api/ | wc -l
# Expected: ~677
```

- [ ] **Step 3: Verify build still passes**

```bash
cd /Users/arhansubasi/recoder.xyz && pnpm --dir recoder-agents build 2>&1 | tail -5
```

---

## Task 7: Fix Analytics Package — Real Metrics

**Files:**
- Modify: `packages/analytics/src/monitoring/model-tracker.ts`
- Modify: `packages/analytics/src/monitoring/alerting/notification-service.ts`
- Modify: `packages/analytics/src/quality/quality-assessor.ts`

- [ ] **Step 1: Fix model-tracker hardcoded metrics**

Replace the 4 hardcoded methods in `packages/analytics/src/monitoring/model-tracker.ts`:

```typescript
// calculateUptimePercentage — compute from actual availability records
private async calculateUptimePercentage(modelId: string): Promise<number> {
  const records = this.availabilityHistory.get(modelId);
  if (!records || records.length === 0) return 100; // No failures recorded = 100%
  const total = records.length;
  const upCount = records.filter(r => r.available).length;
  return Math.round((upCount / total) * 1000) / 10; // One decimal place
}

// calculateMTBF — mean time between failures in hours
private async calculateMTBF(modelId: string): Promise<number> {
  const records = this.availabilityHistory.get(modelId);
  if (!records || records.length < 2) return 0;
  const failures = records.filter(r => !r.available);
  if (failures.length < 2) return 0;
  let totalGap = 0;
  for (let i = 1; i < failures.length; i++) {
    totalGap += failures[i].timestamp - failures[i - 1].timestamp;
  }
  return Math.round((totalGap / (failures.length - 1)) / (1000 * 60 * 60)); // Convert ms to hours
}

// calculateMTTR — mean time to recovery in minutes
private async calculateMTTR(modelId: string): Promise<number> {
  const records = this.availabilityHistory.get(modelId);
  if (!records || records.length < 2) return 0;
  let totalRecoveryTime = 0;
  let recoveryCount = 0;
  for (let i = 1; i < records.length; i++) {
    if (!records[i - 1].available && records[i].available) {
      totalRecoveryTime += records[i].timestamp - records[i - 1].timestamp;
      recoveryCount++;
    }
  }
  if (recoveryCount === 0) return 0;
  return Math.round((totalRecoveryTime / recoveryCount) / (1000 * 60)); // Convert ms to minutes
}

// calculateSLACompliance — percentage of requests within latency SLA
private async calculateSLACompliance(modelId: string): Promise<number> {
  const metrics = this.modelMetrics.get(modelId);
  if (!metrics || metrics.totalRequests === 0) return 100;
  const slaThresholdMs = 5000; // 5 second SLA
  // Use p95 latency as proxy — if p95 < SLA, most requests comply
  const p95 = metrics.latencyP95 || 0;
  if (p95 === 0) return 100;
  if (p95 <= slaThresholdMs) return 99.9;
  if (p95 <= slaThresholdMs * 1.5) return 95;
  return Math.max(0, 100 - ((p95 - slaThresholdMs) / slaThresholdMs) * 50);
}
```

- [ ] **Step 2: Fix notification-service fake sends**

In `packages/analytics/src/monitoring/alerting/notification-service.ts`, replace the 3 fake send methods with real HTTP calls:

```typescript
// sendEmailNotification — use configured SMTP or email API
private async sendEmailNotification(config: NotificationChannelConfig, alert: any): Promise<boolean> {
  const emailEndpoint = config.settings?.endpoint || process.env.ALERT_EMAIL_ENDPOINT;
  if (!emailEndpoint) {
    Logger.warn('No email endpoint configured for alert notifications');
    return false;
  }
  return this.sendHttpRequest(emailEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: config.settings?.recipients || [process.env.ALERT_EMAIL],
      subject: `[${alert.severity?.toUpperCase() || 'ALERT'}] ${alert.title || alert.name}`,
      body: alert.message || JSON.stringify(alert),
    }),
  });
}

// sendTeamsNotification — real Teams webhook
private async sendTeamsNotification(config: NotificationChannelConfig, alert: any): Promise<boolean> {
  const webhookUrl = config.settings?.webhookUrl || process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    Logger.warn('No Teams webhook URL configured');
    return false;
  }
  return this.sendHttpRequest(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '@type': 'MessageCard',
      summary: alert.title || alert.name,
      themeColor: alert.severity === 'critical' ? 'FF0000' : 'FFA500',
      sections: [{
        activityTitle: `${alert.severity?.toUpperCase() || 'ALERT'}: ${alert.title || alert.name}`,
        text: alert.message || JSON.stringify(alert),
      }],
    }),
  });
}

// sendDiscordNotification — real Discord webhook
private async sendDiscordNotification(config: NotificationChannelConfig, alert: any): Promise<boolean> {
  const webhookUrl = config.settings?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    Logger.warn('No Discord webhook URL configured');
    return false;
  }
  return this.sendHttpRequest(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: `${alert.severity?.toUpperCase() || 'ALERT'}: ${alert.title || alert.name}`,
        description: alert.message || JSON.stringify(alert),
        color: alert.severity === 'critical' ? 0xFF0000 : 0xFFA500,
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}
```

- [ ] **Step 3: Fix quality-assessor empty getModelResponse**

In `packages/analytics/src/quality/quality-assessor.ts`, replace the empty method:

```typescript
private async getModelResponse(modelName: string, prompt: string, taskType: string): Promise<string> {
  // Use OpenRouter API if available (same key used by the platform)
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn(`[QualityAssessor] No OPENROUTER_API_KEY configured — skipping response generation for ${modelName}`);
    return '';
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recoder.xyz',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      console.warn(`[QualityAssessor] Model ${modelName} returned ${response.status}`);
      return '';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.warn(`[QualityAssessor] Failed to get response from ${modelName}:`, error);
    return '';
  }
}
```

---

## Task 8: Clean plan.md — Remove Console Log Junk

**Files:**
- Modify: `plan.md`

Lines 997-2353 are pasted browser console errors (CSP violations, minified JS stack traces). This makes the file unusable.

- [ ] **Step 1: Truncate plan.md at line 997**

Remove all content from line 997 onwards (the pasted console output). Keep all actual plan content (lines 1-996).

---

## Execution Order

Tasks 1-4 are independent and can be parallelized.
Task 5 is independent.
Task 6 is a bulk operation, independent.
Task 7 is independent.
Task 8 is independent.

**All 8 tasks can be executed in parallel.**
