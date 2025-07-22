/**
 * Subscription and billing types
 */
import { Timestamp } from './common';
export declare enum SubscriptionPlan {
    FREE = "free",
    STARTER = "starter",
    PRO = "pro",
    TEAM = "team",
    ENTERPRISE = "enterprise"
}
export declare enum SubscriptionStatus {
    ACTIVE = "active",
    PAST_DUE = "past_due",
    CANCELED = "canceled",
    UNPAID = "unpaid",
    TRIALING = "trialing",
    INCOMPLETE = "incomplete",
    INCOMPLETE_EXPIRED = "incomplete_expired"
}
export declare enum BillingInterval {
    MONTHLY = "monthly",
    QUARTERLY = "quarterly",
    YEARLY = "yearly"
}
export declare enum Currency {
    USD = "usd",
    EUR = "eur",
    GBP = "gbp",
    JPY = "jpy",
    CAD = "cad",
    AUD = "aud"
}
export interface Subscription {
    id: string;
    userId: string;
    planId: string;
    plan: SubscriptionPlanDetails;
    status: SubscriptionStatus;
    billingInterval: BillingInterval;
    currency: Currency;
    pricing: SubscriptionPricing;
    usage: SubscriptionUsage;
    features: SubscriptionFeatures;
    billing: BillingInfo;
    trial: TrialInfo;
    cancellation: CancellationInfo;
    timestamps: Timestamp;
}
export interface SubscriptionPlanDetails {
    id: string;
    name: string;
    description: string;
    tier: SubscriptionPlan;
    popular: boolean;
    features: PlanFeature[];
    limits: PlanLimits;
    pricing: PlanPricing[];
    addOns: AddOn[];
    support: SupportLevel;
}
export interface PlanFeature {
    id: string;
    name: string;
    description: string;
    included: boolean;
    limit?: number;
    unit?: string;
    category: 'core' | 'advanced' | 'enterprise' | 'premium';
}
export interface PlanLimits {
    codeGenerations: UsageLimit;
    agentInteractions: UsageLimit;
    projects: UsageLimit;
    teamMembers: UsageLimit;
    storage: UsageLimit;
    apiCalls: UsageLimit;
    customAgents: UsageLimit;
    realTimeCollaboration: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    whiteLabeling: boolean;
    ssoIntegration: boolean;
    auditLogs: boolean;
    dataRetention: number;
}
export interface UsageLimit {
    limit: number;
    unit: string;
    period: 'hour' | 'day' | 'week' | 'month' | 'year' | 'total';
    overage: OveragePolicy;
}
export interface OveragePolicy {
    allowed: boolean;
    pricePerUnit?: number;
    maxOverage?: number;
    throttling?: boolean;
}
export interface PlanPricing {
    interval: BillingInterval;
    currency: Currency;
    amount: number;
    setupFee?: number;
    discountPercentage?: number;
    promotionalPrice?: number;
    promotionalPeriod?: number;
}
export interface AddOn {
    id: string;
    name: string;
    description: string;
    type: 'feature' | 'capacity' | 'service';
    pricing: AddOnPricing[];
    dependencies: string[];
    exclusive: boolean;
}
export interface AddOnPricing {
    interval: BillingInterval;
    currency: Currency;
    amount: number;
    unit?: string;
    tiered?: TieredPricing[];
}
export interface TieredPricing {
    from: number;
    to?: number;
    pricePerUnit: number;
}
export declare enum SupportLevel {
    COMMUNITY = "community",
    EMAIL = "email",
    PRIORITY = "priority",
    DEDICATED = "dedicated",
    WHITE_GLOVE = "white_glove"
}
export interface SubscriptionPricing {
    baseAmount: number;
    addOns: AddOnSubscription[];
    discounts: DiscountApplication[];
    taxes: TaxCalculation[];
    total: number;
    currency: Currency;
    prorationCredits?: number;
    nextBillingAmount?: number;
}
export interface AddOnSubscription {
    addOnId: string;
    quantity: number;
    amount: number;
    startDate: string;
    endDate?: string;
}
export interface DiscountApplication {
    id: string;
    type: 'percentage' | 'fixed' | 'credit';
    value: number;
    description: string;
    appliedAmount: number;
    validUntil?: string;
}
export interface TaxCalculation {
    type: 'vat' | 'sales_tax' | 'gst' | 'other';
    rate: number;
    amount: number;
    jurisdiction: string;
    taxId?: string;
}
export interface SubscriptionUsage {
    currentPeriod: UsagePeriod;
    previousPeriod: UsagePeriod;
    lifetime: LifetimeUsage;
    quotas: UsageQuota[];
    overages: UsageOverage[];
}
export interface UsagePeriod {
    start: string;
    end: string;
    codeGenerations: number;
    agentInteractions: number;
    apiCalls: number;
    storageBytes: number;
    collaborationMinutes: number;
    supportTickets: number;
}
export interface LifetimeUsage {
    totalCodeGenerations: number;
    totalProjects: number;
    totalAgentInteractions: number;
    joinDate: string;
    loyaltyPoints: number;
}
export interface UsageQuota {
    feature: string;
    used: number;
    limit: number;
    resetDate: string;
    overageAllowed: boolean;
}
export interface UsageOverage {
    feature: string;
    amount: number;
    cost: number;
    period: string;
    approved: boolean;
}
export interface SubscriptionFeatures {
    codeGeneration: CodeGenerationFeatures;
    agents: AgentFeatures;
    collaboration: CollaborationFeatures;
    analytics: AnalyticsFeatures;
    integrations: IntegrationFeatures;
    support: SupportFeatures;
    security: SecurityFeatures;
    customization: CustomizationFeatures;
}
export interface CodeGenerationFeatures {
    realIntegrations: boolean;
    productionQuality: boolean;
    customTemplates: boolean;
    advancedValidation: boolean;
    multiLanguage: boolean;
    frameworkSupport: string[];
    qualityGates: boolean;
    securityScanning: boolean;
}
export interface AgentFeatures {
    customAgents: boolean;
    agentMarketplace: boolean;
    agentTraining: boolean;
    multipleAgents: boolean;
    agentCollaboration: boolean;
    agentAnalytics: boolean;
    privateAgents: boolean;
}
export interface CollaborationFeatures {
    teamWorkspaces: boolean;
    realTimeEditing: boolean;
    commentSystem: boolean;
    approvalWorkflows: boolean;
    roleBasedAccess: boolean;
    auditTrails: boolean;
    integrations: string[];
}
export interface AnalyticsFeatures {
    basicAnalytics: boolean;
    advancedMetrics: boolean;
    customDashboards: boolean;
    dataExport: boolean;
    realTimeReporting: boolean;
    predictiveAnalytics: boolean;
    customReports: boolean;
}
export interface IntegrationFeatures {
    githubIntegration: boolean;
    cicdIntegrations: string[];
    cloudProviders: string[];
    thirdPartyServices: string[];
    webhooks: boolean;
    apiAccess: boolean;
    customIntegrations: boolean;
}
export interface SupportFeatures {
    supportLevel: SupportLevel;
    responseTime: string;
    channels: string[];
    dedicatedManager: boolean;
    onboarding: boolean;
    training: boolean;
    consultingHours?: number;
}
export interface SecurityFeatures {
    ssoIntegration: boolean;
    twoFactorAuth: boolean;
    auditLogs: boolean;
    dataEncryption: boolean;
    complianceCertifications: string[];
    privateCloud: boolean;
    customSecurity: boolean;
}
export interface CustomizationFeatures {
    whiteLabeling: boolean;
    customDomain: boolean;
    customBranding: boolean;
    customWorkflows: boolean;
    apiCustomization: boolean;
    customReporting: boolean;
}
export interface BillingInfo {
    customerId: string;
    paymentMethod: PaymentMethod;
    billingAddress: BillingAddress;
    invoices: Invoice[];
    nextBillingDate: string;
    billingCycle: BillingCycle;
    paymentHistory: PaymentRecord[];
}
export interface PaymentMethod {
    id: string;
    type: 'card' | 'bank_account' | 'paypal' | 'crypto' | 'wire_transfer';
    last4?: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    isDefault: boolean;
    verified: boolean;
    fingerprint: string;
}
export interface BillingAddress {
    name: string;
    company?: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    taxId?: string;
}
export interface Invoice {
    id: string;
    number: string;
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    amount: number;
    currency: Currency;
    dueDate: string;
    paidDate?: string;
    description: string;
    lineItems: InvoiceLineItem[];
    taxes: TaxCalculation[];
    discounts: DiscountApplication[];
    downloadUrl: string;
    timestamps: Timestamp;
}
export interface InvoiceLineItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    period?: BillingPeriod;
    metadata: Record<string, any>;
}
export interface BillingPeriod {
    start: string;
    end: string;
}
export interface BillingCycle {
    anchorDate: string;
    interval: BillingInterval;
    intervalCount: number;
    trialEnd?: string;
    cancelAt?: string;
    cancelAtPeriodEnd: boolean;
}
export interface PaymentRecord {
    id: string;
    amount: number;
    currency: Currency;
    status: 'succeeded' | 'pending' | 'failed' | 'refunded';
    paymentMethod: string;
    invoiceId?: string;
    failureReason?: string;
    refundReason?: string;
    processedAt: string;
}
export interface TrialInfo {
    isTrialing: boolean;
    trialStart?: string;
    trialEnd?: string;
    trialDaysRemaining?: number;
    trialPlan?: string;
    conversionGoals: ConversionGoal[];
    trialUsage: TrialUsage;
}
export interface ConversionGoal {
    id: string;
    description: string;
    target: number;
    current: number;
    completed: boolean;
    reward?: string;
}
export interface TrialUsage {
    featuresUsed: string[];
    generationsCreated: number;
    projectsStarted: number;
    agentsCreated: number;
    collaborationSessions: number;
}
export interface CancellationInfo {
    canceledAt?: string;
    cancelReason?: string;
    canceledBy?: string;
    refundIssued?: boolean;
    refundAmount?: number;
    feedbackProvided?: boolean;
    retentionAttempts: RetentionAttempt[];
}
export interface RetentionAttempt {
    id: string;
    type: 'discount' | 'feature_unlock' | 'personal_outreach' | 'survey';
    offered: string;
    response: 'accepted' | 'declined' | 'no_response';
    attemptedAt: string;
    result: string;
}
export interface SubscriptionEvent {
    id: string;
    type: 'created' | 'updated' | 'canceled' | 'trial_started' | 'trial_ended' | 'payment_succeeded' | 'payment_failed' | 'invoice_created';
    subscriptionId: string;
    data: Record<string, any>;
    timestamp: string;
    processed: boolean;
}
export interface CreateSubscriptionRequest {
    planId: string;
    billingInterval: BillingInterval;
    paymentMethodId: string;
    billingAddress: BillingAddress;
    addOns?: string[];
    trialDays?: number;
    couponCode?: string;
}
export interface UpdateSubscriptionRequest {
    planId?: string;
    billingInterval?: BillingInterval;
    addOns?: string[];
    cancelAtPeriodEnd?: boolean;
    pauseCollection?: boolean;
}
export interface UsageReport {
    subscriptionId: string;
    period: BillingPeriod;
    usage: UsagePeriod;
    overages: UsageOverage[];
    projectedCost: number;
    recommendations: UsageRecommendation[];
}
export interface UsageRecommendation {
    type: 'upgrade' | 'downgrade' | 'add_on' | 'optimize';
    description: string;
    potentialSavings?: number;
    requiredAction: string;
    impact: 'low' | 'medium' | 'high';
}
//# sourceMappingURL=subscription.d.ts.map