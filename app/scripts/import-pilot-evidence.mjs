#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=') || 'true'];
}));
const leadsPath = args.get('leads');
const pilotsPath = args.get('pilots');
const actorUserId = args.get('actor-user-id');
const apply = args.get('apply') === 'true';
const confirmed = args.get('confirm') === 'IMPORT_LEGACY_PILOT_EVIDENCE';

if (!leadsPath || !pilotsPath || !actorUserId) {
  throw new Error('Usage: --leads=/absolute/leads.ndjson --pilots=/absolute/pilots.ndjson --actor-user-id=<admin id> [--apply --confirm=IMPORT_LEGACY_PILOT_EVIDENCE]');
}
if (apply && !confirmed) throw new Error('--apply requires --confirm=IMPORT_LEGACY_PILOT_EVIDENCE');

const leads = readNdjson(await readFile(leadsPath, 'utf8'), leadsPath)
  .filter((record) => record.kind === 'design-partner')
  .map(normalizeLead);
const histories = new Map();
for (const raw of readNdjson(await readFile(pilotsPath, 'utf8'), pilotsPath)) {
  const pilot = normalizePilot(raw);
  const revisions = histories.get(pilot.id) ?? [];
  revisions.push(pilot);
  histories.set(pilot.id, revisions);
}
for (const revisions of histories.values()) {
  revisions.sort((left, right) => left.revision - right.revision);
  revisions.forEach((pilot, index) => {
    if (pilot.revision !== index + 1) throw new Error(`Pilot ${pilot.id} has a non-contiguous revision history.`);
  });
}
const leadIds = new Set(leads.map((lead) => lead.id));
for (const revisions of histories.values()) {
  if (!leadIds.has(revisions[0].designPartnerLeadId)) {
    throw new Error(`Pilot ${revisions[0].id} references a lead absent from the supplied lead log.`);
  }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', leads: leads.length, pilots: histories.size, events: [...histories.values()].reduce((sum, rows) => sum + rows.length, 0) }));
if (!apply) process.exit(0);

const prisma = new PrismaClient();
try {
  const actor = await prisma.users.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
  if (!actor || actor.role !== 'admin') throw new Error('actor-user-id must identify a current platform admin.');

  await prisma.$transaction(async (tx) => {
    for (const lead of leads) {
      const requestHash = sha256(canonicalJson(lead));
      const existing = await tx.pilot_design_partner_leads.findUnique({ where: { id: lead.id }, select: { requestHash: true } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error(`Existing lead ${lead.id} differs from the import.`);
        continue;
      }
      await tx.pilot_design_partner_leads.create({
        data: {
          ...lead,
          source: 'legacy-site-ndjson',
          sourceRef: lead.id,
          requestFingerprint: sha256(`legacy-lead\n${lead.id}`),
          requestHash,
        },
      });
    }

    for (const revisions of histories.values()) {
      const current = revisions.at(-1);
      const existing = await tx.pilot_evidence_pilots.findUnique({ where: { id: current.id }, select: { revision: true, status: true } });
      if (existing) {
        if (existing.revision !== current.revision || existing.status !== current.status) throw new Error(`Existing pilot ${current.id} differs from the import.`);
        continue;
      }
      await tx.pilot_evidence_pilots.create({
        data: {
          ...pilotState(current),
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      });
      let previousHash = null;
      for (const revision of revisions) {
        const snapshot = pilotSnapshot(revision);
        const requestHash = sha256(canonicalJson(snapshot));
        const event = {
          pilotId: revision.id,
          actorUserId,
          action: 'pilot.imported',
          fromStatus: revision.revision === 1 ? null : revisions[revision.revision - 2].status,
          toStatus: revision.status,
          revision: revision.revision,
          requestHash,
          requestId: `legacy-import:${revision.id}:${revision.revision}`,
          previousHash,
          snapshot,
          createdAt: new Date(revision.updatedAt),
        };
        const eventHash = sha256(canonicalJson(event));
        await tx.pilot_evidence_events.create({
          data: {
            ...event,
            requestFingerprint: sha256(`legacy-pilot\n${revision.id}\n${revision.revision}`),
            eventHash,
          },
        });
        previousHash = eventHash;
      }
    }
  }, { isolationLevel: 'Serializable', timeout: 60_000 });
  console.log(JSON.stringify({ imported: true, leads: leads.length, pilots: histories.size }));
} finally {
  await prisma.$disconnect();
}

function readNdjson(contents, source) {
  return contents.split('\n').flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; }
    catch { throw new Error(`${source}:${index + 1} is not valid JSON.`); }
  });
}

function normalizeLead(value) {
  const currentAgents = Array.isArray(value.currentAgents) ? value.currentAgents : [];
  if (!isText(value.id, 160) || !isText(value.email, 254) || !isText(value.teamSize, 32) || !isText(value.deployment, 32) || !isText(value.primaryPain, 32) || !isText(value.weeklyRuns, 32) || !isText(value.pilotTiming, 32) || !isTimestamp(value.createdAt) || currentAgents.length === 0 || currentAgents.some((item) => !isText(item, 64))) {
    throw new Error('Invalid design-partner lead in legacy log.');
  }
  return {
    id: value.id,
    email: value.email.trim().toLowerCase(),
    teamSize: value.teamSize,
    currentAgents,
    deployment: value.deployment,
    primaryPain: value.primaryPain,
    weeklyRuns: value.weeklyRuns,
    evidenceRequired: value.evidenceRequired === true,
    pilotTiming: value.pilotTiming,
    interviewConsent: value.interviewConsent === true,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.createdAt),
  };
}

function normalizePilot(value) {
  if (!isText(value.id, 160) || !isText(value.designPartnerLeadId, 160) || !isText(value.metricName, 120) || !isText(value.metricUnit, 40) || !['increase', 'decrease', 'exact'].includes(value.metricDirection) || !['started', 'completed', 'verified', 'cancelled'].includes(value.status) || !finite(value.baselineValue) || !finite(value.targetValue) || (value.outcomeValue !== null && !finite(value.outcomeValue)) || !Number.isInteger(value.revision) || value.revision < 1 || !isTimestamp(value.startedAt) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
    throw new Error('Invalid pilot record in legacy log.');
  }
  for (const field of ['completedAt', 'verifiedAt', 'cancelledAt']) if (value[field] !== null && !isTimestamp(value[field])) throw new Error(`Invalid ${field} in pilot ${value.id}.`);
  if (value.proofUrl !== null && !isText(value.proofUrl, 2048)) throw new Error(`Invalid proof URL in pilot ${value.id}.`);
  return value;
}

function pilotState(value) {
  return {
    id: value.id,
    designPartnerLeadId: value.designPartnerLeadId,
    metricName: value.metricName,
    metricUnit: value.metricUnit,
    metricDirection: value.metricDirection,
    baselineValue: value.baselineValue,
    targetValue: value.targetValue,
    outcomeValue: value.outcomeValue,
    proofUrl: value.proofUrl,
    status: value.status,
    startedAt: new Date(value.startedAt),
    completedAt: value.completedAt ? new Date(value.completedAt) : null,
    verifiedAt: value.verifiedAt ? new Date(value.verifiedAt) : null,
    cancelledAt: value.cancelledAt ? new Date(value.cancelledAt) : null,
    revision: value.revision,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function pilotSnapshot(value) {
  return {
    id: value.id,
    designPartnerLeadId: value.designPartnerLeadId,
    metricName: value.metricName,
    metricUnit: value.metricUnit,
    metricDirection: value.metricDirection,
    baselineValue: value.baselineValue,
    targetValue: value.targetValue,
    outcomeValue: value.outcomeValue,
    proofUrl: value.proofUrl,
    status: value.status,
    startedAt: new Date(value.startedAt).toISOString(),
    completedAt: value.completedAt ? new Date(value.completedAt).toISOString() : null,
    verifiedAt: value.verifiedAt ? new Date(value.verifiedAt).toISOString() : null,
    cancelledAt: value.cancelledAt ? new Date(value.cancelledAt).toISOString() : null,
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
    revision: value.revision,
  };
}

function isText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function isTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000; }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function canonicalJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
