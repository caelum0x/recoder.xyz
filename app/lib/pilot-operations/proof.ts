import { prisma } from '@/lib/prisma';
import { verifyEvidenceChain } from './service';

export const PILOT_PROOF_SCHEMA_VERSION = 1;
export const MINIMUM_PUBLIC_OUTCOME_COHORT = 3;

export interface PilotProofAggregate {
  schemaVersion: number;
  generatedAt: string;
  designPartnerIntakes: number;
  startedPilots: number;
  activePilots: number;
  completedPilots: number;
  verifiedOutcomes: number;
  targetMet: number | null;
  targetMissed: number | null;
  targetMetRatePercent: number | null;
  minimumOutcomeCohort: number;
}

export async function readPilotProofAggregate(): Promise<PilotProofAggregate> {
  const [designPartnerIntakes, pilots] = await prisma.$transaction([
    prisma.pilot_design_partner_leads.count(),
    prisma.pilot_evidence_pilots.findMany({
      include: {
        events: {
          orderBy: { revision: 'asc' },
          select: {
            actorUserId: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            revision: true,
            requestHash: true,
            requestId: true,
            previousHash: true,
            eventHash: true,
            snapshot: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  pilots.forEach((pilot: any) => verifyEvidenceChain(pilot));
  const startedPilots = pilots.length;
  const activePilots = pilots.filter((pilot: any) => pilot.status === 'started').length;
  const completedPilots = pilots.filter((pilot: any) => pilot.status === 'completed' || pilot.status === 'verified').length;
  const verified = pilots.filter((pilot: any) => pilot.status === 'verified' && pilot.outcomeValue !== null && pilot.proofUrl !== null);
  const targetMet = verified.filter((pilot: { metricDirection: string; targetValue: number; outcomeValue: number }) => {
    if (pilot.metricDirection === 'increase') return pilot.outcomeValue >= pilot.targetValue;
    if (pilot.metricDirection === 'decrease') return pilot.outcomeValue <= pilot.targetValue;
    return pilot.outcomeValue === pilot.targetValue;
  }).length;
  const publishBreakdown = verified.length >= MINIMUM_PUBLIC_OUTCOME_COHORT;

  return {
    schemaVersion: PILOT_PROOF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    designPartnerIntakes,
    startedPilots,
    activePilots,
    completedPilots,
    verifiedOutcomes: verified.length,
    targetMet: publishBreakdown ? targetMet : null,
    targetMissed: publishBreakdown ? verified.length - targetMet : null,
    targetMetRatePercent: publishBreakdown ? Math.round((targetMet / verified.length) * 100) : null,
    minimumOutcomeCohort: MINIMUM_PUBLIC_OUTCOME_COHORT,
  };
}
