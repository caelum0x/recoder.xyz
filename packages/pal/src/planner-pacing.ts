/**
 * Planner step pacing ported from modules/communication/pal-mcp-server tools/planner.py.
 *
 * The planner is self-contained (requires_model() = False) and never
 * escalates to an expert model; its value is deterministic pacing:
 * forced deep-thinking pauses early in complex plans, phase-specific
 * required actions, branch/revision bookkeeping, and completion.
 */

export type PlannerStepInput = {
  step: string;
  stepNumber: number;
  totalSteps: number;
  nextStepRequired: boolean;
  isStepRevision?: boolean;
  revisesStepNumber?: number;
  isBranchPoint?: boolean;
  branchFromStep?: number;
  branchId?: string;
  moreStepsNeeded?: boolean;
};

export type PlannerStepStatus =
  | 'planning_complete'
  | 'pause_for_deep_thinking'
  | 'pause_for_planning';

export type PlannerStepDecision = {
  status: PlannerStepStatus;
  /** True only for forced deep-thinking pauses (complex plans, steps 1-3). */
  thinkingRequired: boolean;
  requiredActions: string[];
  nextSteps: string;
  planningComplete: boolean;
  planSummary?: string;
  remainingSteps?: number;
};

/** planner.py:368 — complex plans force reflection in the first three steps. */
export function needsDeepThinkingPause(stepNumber: number, totalSteps: number): boolean {
  return totalSteps >= 5 && stepNumber <= 3;
}

/** Port of PlannerTool.get_required_actions (tools/planner.py:237-272). */
export function getRequiredPlanningActions(stepNumber: number, totalSteps: number): string[] {
  if (stepNumber === 1) {
    return [
      'Think deeply about the complete scope and complexity of what needs to be planned',
      'Consider multiple approaches and their trade-offs',
      'Identify key constraints, dependencies, and potential challenges',
      'Think about stakeholders, success criteria, and critical requirements',
    ];
  }
  if (stepNumber <= 3 && totalSteps >= 5) {
    if (stepNumber === 2) {
      return [
        'Evaluate the approach from step 1 - are there better alternatives?',
        'Break down the major phases and identify critical decision points',
        'Consider resource requirements and potential bottlenecks',
        'Think about how different parts interconnect and affect each other',
      ];
    }
    // stepNumber === 3
    return [
      'Validate that the emerging plan addresses the original requirements',
      'Identify any gaps or assumptions that need clarification',
      'Consider how to validate progress and adjust course if needed',
      'Think about what the first concrete steps should be',
    ];
  }
  return [
    'Continue developing the plan with concrete, actionable steps',
    'Consider implementation details and practical considerations',
    'Think about how to sequence and coordinate different activities',
    'Prepare for execution planning and resource allocation',
  ];
}

/**
 * Port of PlannerTool.handle_work_continuation + completion handling
 * (tools/planner.py:356-472), reduced to the deterministic decision.
 */
export function evaluatePlannerStep(input: PlannerStepInput): PlannerStepDecision {
  if (!input.nextStepRequired) {
    return {
      status: 'planning_complete',
      thinkingRequired: false,
      requiredActions: [],
      planningComplete: true,
      planSummary: `COMPLETE PLAN: ${input.step} (Total ${input.totalSteps} steps completed)`,
      nextSteps: 'Planning complete. Present the complete plan to the user.',
    };
  }

  const requiredActions = getRequiredPlanningActions(input.stepNumber, input.totalSteps);

  if (needsDeepThinkingPause(input.stepNumber, input.totalSteps)) {
    return {
      status: 'pause_for_deep_thinking',
      thinkingRequired: true,
      requiredActions,
      planningComplete: false,
      nextSteps:
        `MANDATORY: DO NOT call the planner tool again immediately. ` +
        `Complex plan (${input.totalSteps} steps) requires deep thinking before ` +
        `step ${input.stepNumber + 1}.`,
    };
  }

  const remainingSteps = input.totalSteps - input.stepNumber;
  return {
    status: 'pause_for_planning',
    thinkingRequired: false,
    requiredActions,
    planningComplete: false,
    remainingSteps,
    nextSteps: `Continue with step ${input.stepNumber + 1}. Approximately ${remainingSteps} steps remaining.`,
  };
}

/**
 * Branch registry semantics (tools/planner.py:422-427): a step registers a
 * branch only when it is a branch point with both origin step and branch id.
 * Returns a new list (immutability preserved for callers).
 */
export function registerPlannerBranch(
  branches: readonly string[],
  input: Pick<PlannerStepInput, 'isBranchPoint' | 'branchFromStep' | 'branchId'>,
): string[] {
  const { isBranchPoint, branchFromStep, branchId } = input;
  if (!isBranchPoint || !branchFromStep || !branchId) {
    return [...branches];
  }
  if (branches.includes(branchId)) {
    return [...branches];
  }
  return [...branches, branchId];
}
