import {
  isAllowedTaskRunTransition,
  isTerminalTaskRunState,
  type TaskRunState,
} from '@recoder/agent-os';

/**
 * A thin state-machine wrapper aligned to `TaskRunState` transitions. Used by the engine
 * to track lifecycle (`created -> ... -> running -> terminal`) and to reject illegal
 * transitions loudly rather than silently advancing.
 */
export class RunLifecycle {
  private current: TaskRunState;

  constructor(initial: TaskRunState = 'created') {
    this.current = initial;
  }

  get state(): TaskRunState {
    return this.current;
  }

  get isTerminal(): boolean {
    return isTerminalTaskRunState(this.current);
  }

  canTransition(to: TaskRunState): boolean {
    return isAllowedTaskRunTransition(this.current, to);
  }

  /** Advance to `to`. Throws on an illegal transition. */
  transition(to: TaskRunState): TaskRunState {
    if (!this.canTransition(to)) {
      throw new Error(`Illegal run transition: ${this.current} -> ${to}`);
    }
    this.current = to;
    return this.current;
  }

  /** Best-effort advance that ignores illegal transitions (driver-reported state frames). */
  tryTransition(to: TaskRunState): boolean {
    if (!this.canTransition(to)) return false;
    this.current = to;
    return true;
  }
}
