export {
  createT3TerminalCommandGate,
  createApprovalPortFromApprovalService,
  type T3TerminalCommandGate,
  type T3CommandGateRequest,
  type T3CommandGateOutcome,
  type T3CommandGateApprovalPort,
  type T3TerminalWriteRequest,
  type CreateT3TerminalCommandGateDeps,
} from './terminal-command-gate.adapter';

export {
  createGovernedPtyProcess,
  type PtyProcessLike,
  type GovernedPtyProcess,
  type GovernedPtyProcessDeps,
  type GovernedPtyWriteContext,
} from './governed-pty-adapter';

export {
  createChildProcessPtyProcess,
  type ChildProcessPtyOptions,
} from './child-process-pty-adapter';
