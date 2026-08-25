-- Production pilot-evidence ledger.
-- Private intake data and operator records remain in PostgreSQL; public proof
-- consumers must use a separate aggregate query and never select these tables.

CREATE TABLE "pilot_design_partner_leads" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'design-partners',
    "sourceRef" TEXT,
    "requestFingerprint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "teamSize" TEXT NOT NULL,
    "currentAgents" TEXT[],
    "deployment" TEXT NOT NULL,
    "primaryPain" TEXT NOT NULL,
    "weeklyRuns" TEXT NOT NULL,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "pilotTiming" TEXT NOT NULL,
    "interviewConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_design_partner_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pilot_evidence_pilots" (
    "id" TEXT NOT NULL,
    "designPartnerLeadId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricUnit" TEXT NOT NULL,
    "metricDirection" TEXT NOT NULL,
    "baselineValue" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "outcomeValue" DOUBLE PRECISION,
    "proofUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'started',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_evidence_pilots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pilot_evidence_pilots_metricDirection_check" CHECK ("metricDirection" IN ('increase', 'decrease', 'exact')),
    CONSTRAINT "pilot_evidence_pilots_status_check" CHECK ("status" IN ('started', 'completed', 'verified', 'cancelled')),
    CONSTRAINT "pilot_evidence_pilots_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "pilot_evidence_events" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_evidence_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pilot_evidence_events_status_check" CHECK ("toStatus" IN ('started', 'completed', 'verified', 'cancelled')),
    CONSTRAINT "pilot_evidence_events_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "pilot_operator_rate_limits" (
    "bucketKey" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_operator_rate_limits_pkey" PRIMARY KEY ("bucketKey"),
    CONSTRAINT "pilot_operator_rate_limits_count_check" CHECK ("count" > 0)
);

CREATE TABLE "pilot_intake_rate_limits" (
    "bucketKey" TEXT NOT NULL,
    "ipDigest" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pilot_intake_rate_limits_pkey" PRIMARY KEY ("bucketKey"),
    CONSTRAINT "pilot_intake_rate_limits_count_check" CHECK ("count" > 0)
);

CREATE UNIQUE INDEX "pilot_design_partner_leads_sourceRef_key" ON "pilot_design_partner_leads"("sourceRef");
CREATE UNIQUE INDEX "pilot_design_partner_leads_requestFingerprint_key" ON "pilot_design_partner_leads"("requestFingerprint");
CREATE INDEX "pilot_design_partner_leads_createdAt_idx" ON "pilot_design_partner_leads"("createdAt");
CREATE INDEX "pilot_design_partner_leads_pilotTiming_createdAt_idx" ON "pilot_design_partner_leads"("pilotTiming", "createdAt");
CREATE INDEX "pilot_evidence_pilots_status_updatedAt_idx" ON "pilot_evidence_pilots"("status", "updatedAt");
CREATE INDEX "pilot_evidence_pilots_designPartnerLeadId_createdAt_idx" ON "pilot_evidence_pilots"("designPartnerLeadId", "createdAt");
CREATE UNIQUE INDEX "pilot_evidence_events_requestFingerprint_key" ON "pilot_evidence_events"("requestFingerprint");
CREATE UNIQUE INDEX "pilot_evidence_events_eventHash_key" ON "pilot_evidence_events"("eventHash");
CREATE UNIQUE INDEX "pilot_evidence_events_pilotId_revision_key" ON "pilot_evidence_events"("pilotId", "revision");
CREATE INDEX "pilot_evidence_events_pilotId_createdAt_idx" ON "pilot_evidence_events"("pilotId", "createdAt");
CREATE INDEX "pilot_evidence_events_actorUserId_createdAt_idx" ON "pilot_evidence_events"("actorUserId", "createdAt");
CREATE INDEX "pilot_operator_rate_limits_windowStart_idx" ON "pilot_operator_rate_limits"("windowStart");
CREATE INDEX "pilot_operator_rate_limits_actorUserId_windowStart_idx" ON "pilot_operator_rate_limits"("actorUserId", "windowStart");
CREATE INDEX "pilot_intake_rate_limits_windowStart_idx" ON "pilot_intake_rate_limits"("windowStart");

ALTER TABLE "pilot_evidence_pilots" ADD CONSTRAINT "pilot_evidence_pilots_designPartnerLeadId_fkey" FOREIGN KEY ("designPartnerLeadId") REFERENCES "pilot_design_partner_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_evidence_pilots" ADD CONSTRAINT "pilot_evidence_pilots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_evidence_pilots" ADD CONSTRAINT "pilot_evidence_pilots_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_evidence_events" ADD CONSTRAINT "pilot_evidence_events_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "pilot_evidence_pilots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pilot_evidence_events" ADD CONSTRAINT "pilot_evidence_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
