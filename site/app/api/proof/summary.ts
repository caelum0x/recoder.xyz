import { readValidationSummary } from "../leads/store";
import { readPilotAggregate } from "../pilots/store";

export interface PublicProofSummary {
  readonly generatedAt: string;
  readonly funnel: {
    readonly designPartnerIntakes: number;
    readonly startedPilots: number;
    readonly activePilots: number;
    readonly completedPilots: number;
    readonly verifiedOutcomes: number;
  };
  readonly intakeSignals: {
    readonly interviewConsents: number;
    readonly evidenceRequired: number;
    readonly readyNow: number;
    readonly highFrequencyTeams: number;
    readonly primaryPains: Readonly<Record<string, number>>;
    readonly activeAgents: Readonly<Record<string, number>>;
  };
  readonly outcomes: {
    readonly minimumCohort: number;
    readonly targetMet: number | null;
    readonly targetMissed: number | null;
    readonly targetMetRatePercent: number | null;
  };
}

export async function readPublicProofSummary(): Promise<PublicProofSummary> {
  const [intake, pilots] = await Promise.all([
    readValidationSummary(),
    readPilotAggregate(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    funnel: {
      designPartnerIntakes: intake.designPartners,
      startedPilots: pilots.startedPilots,
      activePilots: pilots.activePilots,
      completedPilots: pilots.completedPilots,
      verifiedOutcomes: pilots.verifiedOutcomes,
    },
    intakeSignals: {
      interviewConsents: intake.interviewConsents,
      evidenceRequired: intake.evidenceRequired,
      readyNow: intake.readyNow,
      highFrequencyTeams: intake.highFrequencyTeams,
      primaryPains: intake.primaryPains,
      activeAgents: intake.activeAgents,
    },
    outcomes: {
      minimumCohort: pilots.minimumOutcomeCohort,
      targetMet: pilots.targetMet,
      targetMissed: pilots.targetMissed,
      targetMetRatePercent: pilots.targetMetRatePercent,
    },
  };
}
