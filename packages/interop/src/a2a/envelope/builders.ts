/**
 * A2A envelope builders — connector→envelope construction + lifecycle, composed
 * from `@recoder/a2a-sdk`.
 *
 * interop owns the *edge* but reuses the canonical envelope factories so there is
 * exactly one `TaskEnvelope` shape and one legal transition table across the
 * monorepo. These re-exports are the construction half of the wire vocabulary;
 * the verification half lives in `a2a/ingress` (the signed-ingress gate) and
 * `a2a/sign`.
 */
export {
  buildCodexEnvelope,
  buildClaudeEnvelope,
  startEnvelope,
  completeEnvelope,
  failEnvelope,
  cancelEnvelope,
  a2aErrorToTaskErrorInfo,
  type ConnectorEnvelopeInput,
  type CodexEnvelopeOptions,
  type ClaudeEnvelopeOptions,
} from "@recoder/a2a-sdk";

export {
  createTaskEnvelope,
  transitionTaskEnvelope,
  isValidTransition,
  type TaskEnvelope,
  type TaskState,
  type TaskResult,
  type TaskErrorInfo,
} from "@recoder/a2a-sdk";
