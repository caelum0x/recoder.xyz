// @vitest-environment jsdom
/**
 * BoardSearch — the board's search bar + filter chips + Archived toggle.
 * Controlled by the parent's WorkspaceFilters; the only local state is the search
 * input, debounced here. We assert real Preact behavior in jsdom: the search
 * emits after the debounce, chips emit immediately, Clear resets, and the
 * Archived toggle reflects/flips its state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { BoardSearch } from './BoardSearch';

let container: HTMLDivElement | null = null;

const REPOS = ['acme/api', 'acme/web'];
const AGENTS = ['claude', 'codex'];
const STATES = ['running', 'awaiting_review'] as const;

function mount(props: Partial<Parameters<typeof BoardSearch>[0]> = {}): {
  c: HTMLDivElement;
  onFiltersChange: ReturnType<typeof vi.fn>;
  onToggleArchived: ReturnType<typeof vi.fn>;
} {
  const onFiltersChange = vi.fn();
  const onToggleArchived = vi.fn();
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => {
    render(
      <BoardSearch
        filters={props.filters ?? {}}
        onFiltersChange={onFiltersChange}
        repos={REPOS}
        agents={AGENTS}
        states={[...STATES]}
        archivedActive={props.archivedActive ?? false}
        onToggleArchived={onToggleArchived}
        resultCount={props.resultCount}
        totalCount={props.totalCount}
      />,
      c,
    );
  });
  return { c, onFiltersChange, onToggleArchived };
}

function setSelect(c: HTMLDivElement, label: string, value: string): void {
  const el = c.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  if (container) {
    act(() => render(null, container!));
    container.remove();
    container = null;
  }
  vi.useRealTimers();
});

describe('BoardSearch', () => {
  it('renders the search input, three filter chips, and the Archived toggle', () => {
    const { c } = mount();
    expect(c.querySelector('.board-search-input')).not.toBeNull();
    expect(c.querySelector('select[aria-label="Filter by repo"]')).not.toBeNull();
    expect(c.querySelector('select[aria-label="Filter by agent"]')).not.toBeNull();
    expect(c.querySelector('select[aria-label="Filter by state"]')).not.toBeNull();
    expect(c.querySelector('.board-archived-toggle')).not.toBeNull();
  });

  it('chip options come only from the provided facets (no fabricated values)', () => {
    const { c } = mount();
    const repoOpts = Array.from(
      c.querySelectorAll('select[aria-label="Filter by repo"] option'),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(repoOpts).toEqual(['', 'acme/api', 'acme/web']);
  });

  it('emits the search text into filters only after the debounce settles', () => {
    const { c, onFiltersChange } = mount();
    const input = c.querySelector('.board-search-input') as HTMLInputElement;
    act(() => {
      input.value = 'sso';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onFiltersChange).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(250); });
    expect(onFiltersChange).toHaveBeenCalledWith({ q: 'sso' });
  });

  it('selecting a repo chip emits immediately', () => {
    const { c, onFiltersChange } = mount();
    setSelect(c, 'Filter by repo', 'acme/web');
    expect(onFiltersChange).toHaveBeenCalledWith({ repo: 'acme/web' });
  });

  it('selecting a state chip emits the exact state', () => {
    const { c, onFiltersChange } = mount();
    setSelect(c, 'Filter by state', 'awaiting_review');
    expect(onFiltersChange).toHaveBeenCalledWith({ state: 'awaiting_review' });
  });

  it('clearing a chip back to "All" emits undefined for that facet', () => {
    const { c, onFiltersChange } = mount({ filters: { repo: 'acme/api' } });
    setSelect(c, 'Filter by repo', '');
    expect(onFiltersChange).toHaveBeenCalledWith({ repo: undefined });
  });

  it('shows a Clear button when a filter is active and resets everything', () => {
    const { c, onFiltersChange } = mount({ filters: { repo: 'acme/api' } });
    const clear = c.querySelector('.board-search-clear') as HTMLButtonElement;
    expect(clear).not.toBeNull();
    act(() => clear.click());
    expect(onFiltersChange).toHaveBeenCalledWith({});
  });

  it('hides the Clear button when no filter is active', () => {
    const { c } = mount({ filters: {} });
    expect(c.querySelector('.board-search-clear')).toBeNull();
  });

  it('renders a truthful "N of M" count only when a filter narrows the board', () => {
    const { c } = mount({ filters: { q: 'x' }, resultCount: 2, totalCount: 5 });
    expect(c.querySelector('.board-search-count')?.textContent).toBe('2 of 5');
  });

  it('omits the count when the filter matches everything', () => {
    const { c } = mount({ filters: { q: 'x' }, resultCount: 5, totalCount: 5 });
    expect(c.querySelector('.board-search-count')).toBeNull();
  });

  it('toggles the Archived view and reflects the pressed state', () => {
    const { c, onToggleArchived } = mount({ archivedActive: true });
    const toggle = c.querySelector('.board-archived-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('board-archived-toggle-on');
    act(() => toggle.click());
    expect(onToggleArchived).toHaveBeenCalledTimes(1);
  });
});
