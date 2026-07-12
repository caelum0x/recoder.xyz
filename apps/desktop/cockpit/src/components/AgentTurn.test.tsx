// @vitest-environment jsdom
/**
 * AgentTurn renders the agent's log output as clean prose (not a timestamped
 * log grid) with one truthful lifecycle status line.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { AgentTurn, agentProse, turnElapsedLabel, collapseExactRepeat } from './AgentTurn';
import type { RunEvent } from '../types';

let container: HTMLDivElement | null = null;

function mount(events: RunEvent[]): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(<AgentTurn events={events} animate={false} />, c);
  });
  return c;
}

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
    container = null;
  }
});

function ev(type: string, message: string | undefined, ms: number): RunEvent {
  return { eventId: `e${ms}`, type, taskId: 't', runId: 'r', message, createdAt: new Date(ms).toISOString() } as RunEvent;
}

describe('agentProse', () => {
  it('concatenates log output and drops lifecycle events', () => {
    const prose = agentProse([
      ev('started', 'Run started on session recoder-ws_x', 1),
      ev('log', 'Hello — I can help', 2),
      ev('log', ' with the codebase.', 3),
      ev('completed', 'Agent finished', 4),
    ]);
    expect(prose).toBe('Hello — I can help with the codebase.');
  });

  it('strips the tmux dead-pane banner from output', () => {
    const prose = agentProse([ev('log', 'done working\nPane is dead (status 0, Tue)', 1)]);
    expect(prose).toContain('done working');
    expect(prose).not.toMatch(/pane is dead/i);
  });
});

describe('collapseExactRepeat', () => {
  const block = "I don't have a task yet. What would you like me to work on? Given the repo, I can help with a few things here.";

  it('collapses a block repeated many times to a single copy', () => {
    expect(collapseExactRepeat(block.repeat(18))).toBe(block.trim());
  });

  it('collapses a repetition with a partial trailing copy', () => {
    expect(collapseExactRepeat(block.repeat(5) + block.slice(0, 30))).toBe(block.trim());
  });

  it('leaves non-repeating prose untouched', () => {
    const prose = 'First I looked at the router, then the store, then wrote a fix and a test.';
    expect(collapseExactRepeat(prose)).toBe(prose);
  });

  it('leaves a block repeated only twice untouched (needs ≥3× to be an artifact)', () => {
    expect(collapseExactRepeat(block + block)).toBe(block + block);
  });

  it('is a no-op on short strings', () => {
    expect(collapseExactRepeat('hi hi hi')).toBe('hi hi hi');
  });
});

describe('turnElapsedLabel', () => {
  it('formats a sub-minute span in seconds', () => {
    expect(turnElapsedLabel([ev('started', undefined, 0), ev('completed', undefined, 12_000)])).toBe('12s');
  });

  it('formats a multi-minute span as minutes and seconds', () => {
    expect(turnElapsedLabel([ev('started', undefined, 0), ev('completed', undefined, 135_000)])).toBe('2m 15s');
  });

  it('returns empty for a single event or a sub-second span', () => {
    expect(turnElapsedLabel([ev('log', 'x', 1)])).toBe('');
    expect(turnElapsedLabel([ev('started', undefined, 0), ev('completed', undefined, 400)])).toBe('');
  });
});

describe('AgentTurn rendering', () => {
  it('shows the agent prose and a working status while running', () => {
    const c = mount([
      ev('started', 'Run started on session recoder-ws_x', 1),
      ev('log', 'Hi! I can help with the Recoder codebase.', 2),
    ]);
    expect(c.querySelector('.agent-turn-body')?.textContent).toBe('Hi! I can help with the Recoder codebase.');
    // No raw "Run started on session" noise in the prose.
    expect(c.querySelector('.agent-turn-body')?.textContent).not.toContain('Run started on session');
    expect(c.querySelector('.agent-turn-status')?.textContent).toMatch(/working/i);
    expect(c.querySelector('.status-working')).not.toBeNull();
  });

  it('shows a done status when the run completed', () => {
    const c = mount([
      ev('log', 'All set — the file is created.', 1),
      ev('completed', 'Agent finished', 2),
    ]);
    expect(c.querySelector('.status-done')).not.toBeNull();
    expect(c.querySelector('.agent-turn-status')?.textContent).toMatch(/done/i);
  });

  it('shows a stopped status on failure', () => {
    const c = mount([
      ev('log', 'partial work', 1),
      ev('failed', 'Agent stopped', 2),
    ]);
    expect(c.querySelector('.status-stopped')).not.toBeNull();
  });

  it('shows a thinking placeholder when there is no prose yet', () => {
    const c = mount([ev('started', 'Run started', 1)]);
    expect(c.querySelector('.agent-turn-thinking')).not.toBeNull();
    expect(c.querySelector('.agent-turn-body')).toBeNull();
  });
});
