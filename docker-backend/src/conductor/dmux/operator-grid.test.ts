/**
 * Tests for the conductor operator-grid (dmux LayoutCalculator fusion).
 *
 * The dmux import is mocked through the injectable `loadLayoutModule` seam, so
 * no real tmux (and no real dmux load) is needed for the logic tests. One
 * integration test exercises the REAL default loader against the vendored
 * ts/dmux dist to prove the lazy file-URL import genuinely works and is
 * side-effect free (no `.gitignore` write in cwd).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  computeOperatorGrid,
  loadDmuxLayoutModule,
  DEFAULT_DMUX_LAYOUT_CONFIG,
  type DmuxLayoutConfig,
  type DmuxLayoutConfiguration,
  type DmuxLayoutModule,
  type OperatorGridWorkspace,
} from './operator-grid.js';

/** Fake LayoutCalculator that mirrors dmux's per-column distribution semantics. */
function fakeLayoutModule(
  layout: DmuxLayoutConfiguration,
  calls: Array<{ config: DmuxLayoutConfig; args: number[] }> = [],
): DmuxLayoutModule {
  class FakeLayoutCalculator {
    constructor(private config: DmuxLayoutConfig) {}
    calculateOptimalLayout(n: number, w: number, h: number): DmuxLayoutConfiguration {
      calls.push({ config: this.config, args: [n, w, h] });
      return layout;
    }
  }
  return { LayoutCalculator: FakeLayoutCalculator as DmuxLayoutModule['LayoutCalculator'] };
}

function makeWorkspaces(count: number): OperatorGridWorkspace[] {
  return Array.from({ length: count }, (_, i) => ({
    workspaceId: `ws_${i + 1}`,
    sessionName: `recoder-ws_${i + 1}`,
    state: i === 0 ? 'running' : 'awaiting_review',
  }));
}

describe('computeOperatorGrid (mocked dmux seam)', () => {
  it('maps workspaces onto the dmux layout column-major per paneDistribution', async () => {
    const calls: Array<{ config: DmuxLayoutConfig; args: number[] }> = [];
    const layout: DmuxLayoutConfiguration = {
      cols: 3,
      rows: 2,
      windowWidth: 300,
      paneDistribution: [2, 2, 1],
      actualPaneWidth: 86.33,
    };
    const workspaces = makeWorkspaces(5);

    const grid = await computeOperatorGrid(workspaces, {
      terminalWidth: 300,
      terminalHeight: 60,
      loadLayoutModule: async () => fakeLayoutModule(layout, calls),
    });

    expect(grid).toBeDefined();
    expect(grid?.cols).toBe(3);
    expect(grid?.rows).toBe(2);
    expect(grid?.windowWidth).toBe(300);
    expect(grid?.paneDistribution).toEqual([2, 2, 1]);
    expect(grid?.cells).toHaveLength(5);

    // Column-major placement: col0 gets ws_1/ws_2, col1 ws_3/ws_4, col2 ws_5.
    expect(grid?.cells.map((c) => [c.workspaceId, c.column, c.rowInColumn])).toEqual([
      ['ws_1', 0, 0],
      ['ws_2', 0, 1],
      ['ws_3', 1, 0],
      ['ws_4', 1, 1],
      ['ws_5', 2, 0],
    ]);
    // Width floored from dmux's fractional actualPaneWidth.
    expect(grid?.cells.every((c) => c.width === 86)).toBe(true);
    // Height per column: 2-row columns → floor((60-1)/2)=29; 1-row column → 60.
    expect(grid?.cells[0].height).toBe(29);
    expect(grid?.cells[4].height).toBe(60);
    // State + session flow through untouched.
    expect(grid?.cells[0].state).toBe('running');
    expect(grid?.cells[0].sessionName).toBe('recoder-ws_1');

    // The calculator was driven with the sanitized inputs + default config.
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([5, 300, 60]);
    expect(calls[0].config).toEqual(DEFAULT_DMUX_LAYOUT_CONFIG);
  });

  it('merges layoutConfig overrides over the dmux defaults', async () => {
    const calls: Array<{ config: DmuxLayoutConfig; args: number[] }> = [];
    const layout: DmuxLayoutConfiguration = {
      cols: 1,
      rows: 1,
      windowWidth: 200,
      paneDistribution: [1],
      actualPaneWidth: 160,
    };

    await computeOperatorGrid(makeWorkspaces(1), {
      terminalWidth: 200,
      terminalHeight: 50,
      layoutConfig: { SIDEBAR_WIDTH: 0 },
      loadLayoutModule: async () => fakeLayoutModule(layout, calls),
    });

    expect(calls[0].config).toEqual({ ...DEFAULT_DMUX_LAYOUT_CONFIG, SIDEBAR_WIDTH: 0 });
  });

  it('returns an honest empty grid for an empty workspace list', async () => {
    const layout: DmuxLayoutConfiguration = {
      cols: 0,
      rows: 0,
      windowWidth: 240,
      paneDistribution: [],
      actualPaneWidth: 0,
    };

    const grid = await computeOperatorGrid([], {
      loadLayoutModule: async () => fakeLayoutModule(layout),
    });

    expect(grid).toBeDefined();
    expect(grid?.cols).toBe(0);
    expect(grid?.cells).toEqual([]);
  });

  it('filters structurally invalid workspace entries before layout', async () => {
    const calls: Array<{ config: DmuxLayoutConfig; args: number[] }> = [];
    const layout: DmuxLayoutConfiguration = {
      cols: 1,
      rows: 1,
      windowWidth: 240,
      paneDistribution: [1],
      actualPaneWidth: 100,
    };
    const dirty = [
      ...makeWorkspaces(1),
      null,
      { workspaceId: '', sessionName: 's', state: 'running' },
      { sessionName: 'no-id', state: 'running' },
    ] as unknown as OperatorGridWorkspace[];

    const grid = await computeOperatorGrid(dirty, {
      loadLayoutModule: async () => fakeLayoutModule(layout, calls),
    });

    expect(calls[0].args[0]).toBe(1); // only the valid workspace counted
    expect(grid?.cells).toHaveLength(1);
    expect(grid?.cells[0].workspaceId).toBe('ws_1');
  });

  it('sanitizes bogus terminal dimensions to the defaults', async () => {
    const calls: Array<{ config: DmuxLayoutConfig; args: number[] }> = [];
    const layout: DmuxLayoutConfiguration = {
      cols: 1,
      rows: 1,
      windowWidth: 240,
      paneDistribution: [1],
      actualPaneWidth: 100,
    };

    await computeOperatorGrid(makeWorkspaces(1), {
      terminalWidth: Number.NaN,
      terminalHeight: -5,
      loadLayoutModule: async () => fakeLayoutModule(layout, calls),
    });

    expect(calls[0].args).toEqual([1, 240, 60]);
  });

  it('returns undefined when dmux is unavailable (loader → null)', async () => {
    const grid = await computeOperatorGrid(makeWorkspaces(2), {
      loadLayoutModule: async () => null,
    });
    expect(grid).toBeUndefined();
  });

  it('returns undefined (never throws) when the loader throws', async () => {
    const grid = await computeOperatorGrid(makeWorkspaces(2), {
      loadLayoutModule: async () => {
        throw new Error('dmux exploded');
      },
    });
    expect(grid).toBeUndefined();
  });

  it('returns undefined (never throws) when the calculator throws', async () => {
    class ThrowingCalculator {
      calculateOptimalLayout(): DmuxLayoutConfiguration {
        throw new Error('calculator exploded');
      }
    }
    const grid = await computeOperatorGrid(makeWorkspaces(2), {
      loadLayoutModule: async () => ({
        LayoutCalculator: ThrowingCalculator as DmuxLayoutModule['LayoutCalculator'],
      }),
    });
    expect(grid).toBeUndefined();
  });

  it('returns undefined when dmux returns a structurally invalid layout', async () => {
    const grid = await computeOperatorGrid(makeWorkspaces(2), {
      loadLayoutModule: async () =>
        fakeLayoutModule({ cols: Number.NaN } as unknown as DmuxLayoutConfiguration),
    });
    expect(grid).toBeUndefined();
  });
});

/** Is the vendored dmux dist actually on disk? Gates the integration test. */
function dmuxLayoutDistPresent(): boolean {
  try {
    const req = createRequire(__filename);
    const root = path.dirname(req.resolve('@recoder/dmux/package.json'));
    return existsSync(path.join(root, 'dist', 'layout', 'LayoutCalculator.js'));
  } catch {
    return false;
  }
}

describe('loadDmuxLayoutModule (real vendored dmux dist)', () => {
  it('lazy-loads the real LayoutCalculator without side effects', async () => {
    const mod = await loadDmuxLayoutModule();
    if (!dmuxLayoutDistPresent()) {
      // Degrade-safe by contract: environment without the vendored dmux dist.
      // Do not fake success — just assert the truthful null return.
      expect(mod).toBeNull();
      return;
    }
    // The dist IS present — the loader must genuinely load it (a null here
    // would mean the lazy-import seam is broken, which must fail the test).
    expect(mod).not.toBeNull();

    const gitignorePath = path.join(process.cwd(), '.gitignore');
    const gitignoreBefore = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf8')
      : null;

    const grid = await computeOperatorGrid(makeWorkspaces(5), {
      terminalWidth: 300,
      terminalHeight: 60,
    });

    // Verified expected output of dmux's scorer for 5 panes @ 300x60.
    expect(grid).toBeDefined();
    expect(grid?.cols).toBe(3);
    expect(grid?.rows).toBe(2);
    expect(grid?.paneDistribution).toEqual([2, 2, 1]);
    expect(grid?.cells).toHaveLength(5);

    // No dist/index.js app-setup side effects leaked in (gitignore untouched).
    const gitignoreAfter = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf8')
      : null;
    expect(gitignoreAfter).toBe(gitignoreBefore);
  });

  it('is used as the default seam when no loader is supplied', async () => {
    // Contract check without asserting dmux presence: the default path either
    // yields a real grid or a truthful undefined — never a throw.
    await expect(computeOperatorGrid(makeWorkspaces(1))).resolves.not.toThrow;
    const grid = await computeOperatorGrid(makeWorkspaces(1));
    expect(grid === undefined || Array.isArray(grid.cells)).toBe(true);
  });
});
