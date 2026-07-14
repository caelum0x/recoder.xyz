/**
 * Conductor operator-grid — computes a dmux-style operator grid over conductor
 * workspaces (Wave G1 backend fusion of ts/dmux `LayoutCalculator`).
 *
 * dmux's `LayoutCalculator` (dist/layout/LayoutCalculator.js) is a PURE scoring
 * algorithm: given a pane count + terminal dimensions + comfort config it returns
 * the optimal {cols, rows, paneDistribution, windowWidth, actualPaneWidth}. This
 * module lazy-loads ONLY that submodule from the vendored `@recoder/dmux` dist and
 * maps conductor workspaces onto the resulting grid (column-major, matching dmux's
 * per-column `paneDistribution` semantics).
 *
 * CRITICAL import constraints (verified):
 *   - NEVER import `@recoder/dmux` (dist/index.js) — its top level runs app setup
 *     side effects (.gitignore writes, onboarding).
 *   - The package `exports` map only exposes "." and "./package.json", so submodule
 *     dists must be resolved via `require.resolve('@recoder/dmux/package.json')` +
 *     a direct file-URL dynamic `import()`.
 *   - dmux dist is ESM while backend compiles CJS, so the dynamic import is
 *     kept native via an indirect `new Function('s','return import(s)')` (same
 *     pattern as `src/a2a/pi-runtime-adapter.ts`); tsc would otherwise transpile
 *     `import()` into `require()`.
 *
 * Degrade-safe: when dmux is unavailable (not installed, dist missing, load error)
 * every entry point returns `undefined` truthfully — this module NEVER throws and
 * NEVER fakes a grid.
 */
import { createLogger } from '../../logger.js';

const logger = createLogger('conductor:dmux:operator-grid');

/** A conductor workspace to place on the operator grid. */
export interface OperatorGridWorkspace {
  workspaceId: string;
  /** tmux session backing the workspace (`recoder-<id>` naming). */
  sessionName: string;
  /** Workspace lifecycle state (running / awaiting_review / ...). */
  state: string;
}

/** dmux layout comfort config (mirrors ts/dmux src/utils/layoutManager.ts). */
export interface DmuxLayoutConfig {
  SIDEBAR_WIDTH: number;
  MIN_COMFORTABLE_WIDTH: number;
  MAX_COMFORTABLE_WIDTH: number;
  MIN_COMFORTABLE_HEIGHT: number;
}

/** dmux DEFAULT_LAYOUT_CONFIG values (verified against dist/utils/layoutManager.js). */
export const DEFAULT_DMUX_LAYOUT_CONFIG: Readonly<DmuxLayoutConfig> = Object.freeze({
  SIDEBAR_WIDTH: 40,
  MIN_COMFORTABLE_WIDTH: 60,
  MAX_COMFORTABLE_WIDTH: 100,
  MIN_COMFORTABLE_HEIGHT: 15,
});

/** Fallback terminal dimensions when the caller does not supply real ones. */
const DEFAULT_TERMINAL_WIDTH = 240;
const DEFAULT_TERMINAL_HEIGHT = 60;

/** Shape returned by dmux LayoutCalculator#calculateOptimalLayout. */
export interface DmuxLayoutConfiguration {
  cols: number;
  rows: number;
  windowWidth: number;
  /** paneDistribution[i] = number of panes in column i (per-column semantics). */
  paneDistribution: number[];
  actualPaneWidth: number;
}

/** Minimal structural surface of dmux's LayoutCalculator instance. */
interface DmuxLayoutCalculatorLike {
  calculateOptimalLayout(
    numContentPanes: number,
    terminalWidth: number,
    terminalHeight: number,
  ): DmuxLayoutConfiguration;
}

/** Minimal structural surface of dist/layout/LayoutCalculator.js. */
export interface DmuxLayoutModule {
  LayoutCalculator: new (config: DmuxLayoutConfig) => DmuxLayoutCalculatorLike;
}

/** Injectable loader seam (tests mock this; production uses the lazy default). */
export type DmuxLayoutModuleLoader = () => Promise<DmuxLayoutModule | null>;

/**
 * dmux exposes its PURE engine submodules as clean subpath exports (added to
 * ts/dmux/package.json for the Recoder fusion) — so we import the specifier
 * directly instead of resolving the package root + joining dist paths. The root
 * "." export runs app setup on import; this subpath is side-effect-free.
 */
const DMUX_LAYOUT_SPECIFIER = '@recoder/dmux/layout/LayoutCalculator';

/**
 * Native dynamic import kept out of tsc's reach: with `module: commonjs`, a plain
 * `import()` is transpiled to `require()`, which cannot load a `file://` URL of an
 * ESM dist. The indirect Function preserves the real dynamic import at runtime.
 */
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Record<string, unknown>>;

/**
 * Import an ESM package subpath from CJS-compiled code, robust across BOTH runtimes:
 *   1. Plain CJS Node runtime: the indirect native `import(specifier)` (verified —
 *    tsc cannot rewrite it into `require()`).
 *   2. vitest/vite-node VM: the indirect Function throws ("dynamic import
 *      callback was not specified"), so fall back to a plain `import(specifier)`
 *      which the vite transform handles.
 */
async function importEsmSpecifier(specifier: string): Promise<Record<string, unknown>> {
  try {
    return await nativeImport(specifier);
  } catch {
    return (await import(specifier)) as Record<string, unknown>;
  }
}

/**
 * Default lazy loader for dmux's PURE LayoutCalculator submodule (via its clean
 * subpath export). Side-effect-free. Returns `null` (never throws) when the
 * package or submodule is unavailable or structurally wrong.
 */
export async function loadDmuxLayoutModule(): Promise<DmuxLayoutModule | null> {
  try {
    const mod = await importEsmSpecifier(DMUX_LAYOUT_SPECIFIER);
    const LayoutCalculator = (mod as { LayoutCalculator?: DmuxLayoutModule['LayoutCalculator'] })
      .LayoutCalculator;
    if (typeof LayoutCalculator !== 'function') return null;
    return { LayoutCalculator };
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      'dmux LayoutCalculator unavailable — operator grid degrades to undefined',
    );
    return null;
  }
}

/** One workspace placed on the operator grid. */
export interface OperatorGridCell {
  workspaceId: string;
  sessionName: string;
  state: string;
  /** Zero-based column index. */
  column: number;
  /** Zero-based row index within the column. */
  rowInColumn: number;
  /** Pane width in terminal cells (floored from dmux's fractional width). */
  width: number;
  /** Pane height in terminal cells for this column. */
  height: number;
}

/** The computed operator grid over the supplied workspaces. */
export interface OperatorGrid {
  cols: number;
  rows: number;
  windowWidth: number;
  actualPaneWidth: number;
  paneDistribution: number[];
  terminalWidth: number;
  terminalHeight: number;
  cells: OperatorGridCell[];
}

export interface OperatorGridOptions {
  /** Terminal width in cells (defaults to 240). */
  terminalWidth?: number;
  /** Terminal height in cells (defaults to 60). */
  terminalHeight?: number;
  /** Partial override of the dmux comfort config. */
  layoutConfig?: Partial<DmuxLayoutConfig>;
  /** Injectable loader seam — tests supply a fake; production omits it. */
  loadLayoutModule?: DmuxLayoutModuleLoader;
}

/** Clamp a caller-supplied dimension to a sane positive integer, else fallback. */
function sanitizeDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

/** Keep only structurally valid workspace entries (validate at the boundary). */
function sanitizeWorkspaces(workspaces: readonly OperatorGridWorkspace[]): OperatorGridWorkspace[] {
  if (!Array.isArray(workspaces)) return [];
  return workspaces.filter(
    (ws): ws is OperatorGridWorkspace =>
      !!ws &&
      typeof ws === 'object' &&
      typeof ws.workspaceId === 'string' &&
      ws.workspaceId.length > 0 &&
      typeof ws.sessionName === 'string' &&
      typeof ws.state === 'string',
  );
}

/** Structural sanity check on the layout dmux returned (never trust blindly). */
function isValidLayout(layout: unknown): layout is DmuxLayoutConfiguration {
  if (!layout || typeof layout !== 'object') return false;
  const l = layout as DmuxLayoutConfiguration;
  return (
    Number.isFinite(l.cols) &&
    Number.isFinite(l.rows) &&
    Number.isFinite(l.windowWidth) &&
    Number.isFinite(l.actualPaneWidth) &&
    Array.isArray(l.paneDistribution)
  );
}

/**
 * Map workspaces onto grid cells column-major, honouring dmux's per-column
 * `paneDistribution` (e.g. 5 panes / 3 cols → [2, 2, 1]). Pane height per column
 * follows dmux's formula: floor((terminalHeight - rowBorders) / rowsInColumn).
 */
function placeWorkspaces(
  workspaces: readonly OperatorGridWorkspace[],
  layout: DmuxLayoutConfiguration,
  terminalHeight: number,
): OperatorGridCell[] {
  const cellWidth = Math.max(1, Math.floor(layout.actualPaneWidth));
  const cells: OperatorGridCell[] = [];
  let cursor = 0;
  layout.paneDistribution.forEach((panesInColumn, column) => {
    const rowsInColumn = Math.max(1, Math.floor(panesInColumn));
    const rowBorders = rowsInColumn - 1;
    const height = Math.max(1, Math.floor((terminalHeight - rowBorders) / rowsInColumn));
    for (let rowInColumn = 0; rowInColumn < panesInColumn && cursor < workspaces.length; rowInColumn++) {
      const ws = workspaces[cursor];
      cursor += 1;
      cells.push({
        workspaceId: ws.workspaceId,
        sessionName: ws.sessionName,
        state: ws.state,
        column,
        rowInColumn,
        width: cellWidth,
        height,
      });
    }
  });
  return cells;
}

/**
 * Compute the operator grid for a set of conductor workspaces using dmux's pure
 * LayoutCalculator. Returns `undefined` (truthfully, never throws) when dmux is
 * unavailable or returns a structurally invalid layout. An empty workspace list
 * with dmux available yields an honest empty grid (`cols: 0, cells: []`).
 */
export async function computeOperatorGrid(
  workspaces: readonly OperatorGridWorkspace[],
  opts: OperatorGridOptions = {},
): Promise<OperatorGrid | undefined> {
  try {
    const loader = opts.loadLayoutModule ?? loadDmuxLayoutModule;
    const layoutModule = await loader();
    if (!layoutModule || typeof layoutModule.LayoutCalculator !== 'function') {
      return undefined;
    }

    const terminalWidth = sanitizeDimension(opts.terminalWidth, DEFAULT_TERMINAL_WIDTH);
    const terminalHeight = sanitizeDimension(opts.terminalHeight, DEFAULT_TERMINAL_HEIGHT);
    const config: DmuxLayoutConfig = { ...DEFAULT_DMUX_LAYOUT_CONFIG, ...opts.layoutConfig };
    const valid = sanitizeWorkspaces(workspaces);

    const calculator = new layoutModule.LayoutCalculator(config);
    const layout = calculator.calculateOptimalLayout(valid.length, terminalWidth, terminalHeight);
    if (!isValidLayout(layout)) {
      logger.warn({ layout }, 'dmux LayoutCalculator returned an invalid layout — degrading');
      return undefined;
    }

    return {
      cols: layout.cols,
      rows: layout.rows,
      windowWidth: layout.windowWidth,
      actualPaneWidth: layout.actualPaneWidth,
      paneDistribution: [...layout.paneDistribution],
      terminalWidth,
      terminalHeight,
      cells: placeWorkspaces(valid, layout, terminalHeight),
    };
  } catch (err) {
    // Degrade-safe: any failure (loader threw, calculator misbehaved) yields
    // a truthful "no grid" — never a crash, never a fabricated layout.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'operator grid computation failed — degrading to undefined',
    );
    return undefined;
  }
}
