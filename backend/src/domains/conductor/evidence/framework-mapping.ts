/**
 * Framework annotation mapper (enterprise evidence upsell, kept honest) — map ONE
 * stored {@link ConvergenceEvidenceRecord} to the small set of compliance-framework
 * controls (SOC 2 / EU AI Act / DORA) that the record's ACTUALLY-PRESENT evidence
 * sections can defensibly speak to.
 *
 * This is PURE, DERIVED metadata: it asserts nothing about compliance status (that
 * is `evidence-export.ts`'s per-control derivation) — it only says "this control's
 * evidence lives in these sections of this record". The truthfulness invariant:
 * an annotation is emitted ONLY when every section it references is present in the
 * record — a record with no human approval emits NO human-oversight mapping, a
 * record with no verification emits NO DORA mapping, an empty record maps to [].
 * Never a mapping whose referenced evidence does not exist.
 */
import type { ConvergenceEvidenceRecord } from './convergence-evidence.js';

/** The three external frameworks the starter catalog annotates (small on purpose). */
export type EvidenceFramework = 'SOC2' | 'EU-AI-Act' | 'DORA';

/**
 * A named evidence SECTION of the record an annotation may reference. Presence is
 * defined per-section in {@link presentSections} — strictly, from the record itself.
 */
export type EvidenceSectionRef =
  | 'governance.verdict'
  | 'approval'
  | 'seal'
  | 'verification'
  | 'convergence.selections';

/** One framework control annotated onto a record, backed only by present sections. */
export interface FrameworkAnnotation {
  readonly framework: EvidenceFramework;
  /** The control identifier within the framework, e.g. `CC8.1` or `Art. 14`. */
  readonly control: string;
  /** The record sections that carry this control's evidence — ALL present, always. */
  readonly satisfiedBy: readonly EvidenceSectionRef[];
  /** One line: why these sections speak to this control. */
  readonly rationale: string;
}

/** A catalog row: emit iff every `required` section is present; `corroborating` sections join `satisfiedBy` when present. */
interface ControlMapping {
  readonly framework: EvidenceFramework;
  readonly control: string;
  readonly required: readonly EvidenceSectionRef[];
  readonly corroborating?: readonly EvidenceSectionRef[];
  readonly rationale: string;
}

/**
 * The starter catalog — deliberately SMALL (3 controls per framework) and limited
 * to controls this record shape can actually evidence. Every row anchors on at
 * least one genuinely optional section (approval / seal / verification /
 * selections) so a bare record truthfully maps to nothing.
 */
const CONTROL_CATALOG: readonly ControlMapping[] = [
  {
    framework: 'SOC2',
    control: 'CC8.1',
    required: ['governance.verdict', 'approval', 'seal'],
    rationale:
      'Change management: the governed merge verdict, the recorded human approval, and the tamper-evident audit seal together evidence an authorized, tracked change.',
  },
  {
    framework: 'SOC2',
    control: 'CC7.2',
    required: ['verification'],
    rationale:
      'System monitoring: the pre-merge readiness verification evidences the change was checked for anomalies before promotion.',
  },
  {
    framework: 'SOC2',
    control: 'CC4.1',
    required: ['seal'],
    rationale:
      'Monitoring of controls: the hash-chained Merkle audit seal supports independent after-the-fact evaluation of the change trail.',
  },
  {
    framework: 'EU-AI-Act',
    control: 'Art. 14',
    required: ['approval'],
    corroborating: ['convergence.selections'],
    rationale:
      'Human oversight: a recorded human approval (corroborated by contested per-file picks when present) evidences a human overseeing the AI-produced change.',
  },
  {
    framework: 'EU-AI-Act',
    control: 'Art. 12',
    required: ['seal'],
    rationale:
      'Record-keeping: the hash-chained audit seal evidences automatic, tamper-evident logging of the merge event.',
  },
  {
    framework: 'EU-AI-Act',
    control: 'Art. 9',
    required: ['governance.verdict', 'verification'],
    rationale:
      'Risk management: the risk-tiered governance verdict plus pre-merge verification evidence a risk-managed release step.',
  },
  {
    framework: 'DORA',
    control: 'Art. 9(4)(e)',
    required: ['verification', 'seal'],
    rationale:
      'ICT change management: pre-merge verification plus the sealed audit trail evidence a controlled, tested ICT change.',
  },
  {
    framework: 'DORA',
    control: 'Art. 24',
    required: ['verification'],
    rationale:
      'Operational resilience testing: the pre-merge verification run is the recorded test evidence for this change.',
  },
  {
    framework: 'DORA',
    control: 'Art. 6',
    required: ['governance.verdict', 'verification'],
    rationale:
      'ICT risk management framework: the risk-tiered governance decision plus verification show the change passed the ICT risk framework.',
  },
];

/**
 * Which sections this record ACTUALLY carries. Defensive optional-chaining on
 * purpose: stored records are read back from workspace metadata via an unvalidated
 * cast, so presence is proven from the runtime value, never assumed from the type.
 */
function presentSections(record: ConvergenceEvidenceRecord): ReadonlySet<EvidenceSectionRef> {
  const evidence = record?.evidence;
  const present = new Set<EvidenceSectionRef>();

  // The governance verdict block records the merge decision — present whenever an
  // effect was recorded (it always is for a real record; proven, not assumed).
  if (typeof evidence?.governance?.effect === 'string') present.add('governance.verdict');

  // A human approval exists only when governance carries a recorded approvalId.
  if (evidence?.governance?.approvalId) present.add('approval');

  // The seal section exists only when the Merkle chain actually assigned a leaf —
  // a null auditEntryHash is a truthful "sealing was skipped", not evidence.
  if (record?.seal?.auditEntryHash != null) present.add('seal');

  // Verification counts as evidence only when it actually RAN (`available:true`) —
  // a truthful `available:false` + reason is a gap record, not verification.
  if (evidence?.verification?.available === true) present.add('verification');

  // For human-oversight purposes a selection counts only when a HUMAN resolved it:
  // a contested path settled by an explicit pick. Uncontested auto-picks and
  // (model-)synthesized merges are mechanical, not human oversight.
  const selections = evidence?.convergence?.selections;
  if (Array.isArray(selections) && selections.some(s => s?.contested && s?.mode === 'pick')) {
    present.add('convergence.selections');
  }

  return present;
}

/**
 * Map a record to its defensible framework annotations. PURE: no I/O, no status
 * claims. Filters the catalog truthfully per record — an annotation appears iff
 * every required section is present; corroborating sections are appended only when
 * they are present too, so `satisfiedBy` never references absent evidence.
 */
export function mapFrameworkAnnotations(
  record: ConvergenceEvidenceRecord
): readonly FrameworkAnnotation[] {
  const present = presentSections(record);
  const annotations: FrameworkAnnotation[] = [];
  for (const mapping of CONTROL_CATALOG) {
    if (!mapping.required.every(section => present.has(section))) continue;
    const corroborating = (mapping.corroborating ?? []).filter(section =>
      present.has(section)
    );
    annotations.push({
      framework: mapping.framework,
      control: mapping.control,
      satisfiedBy: [...mapping.required, ...corroborating],
      rationale: mapping.rationale,
    });
  }
  return annotations;
}
