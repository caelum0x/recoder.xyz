/**
 * Runtime-agnostic hook primitive contract.
 *
 * The animation hooks in this directory only depend on a small subset of the
 * React hook surface: `useState`, `useEffect`, `useRef`, and `useCallback`.
 * Both `react` and `preact/hooks` expose API-compatible versions of these
 * primitives, so the hook logic can be implemented once against this contract
 * and bound to a concrete runtime by a thin entry file.
 *
 * The existing `./index` entry binds these to `react` (unchanged behavior).
 * The additive `./preact` entry binds them to `preact/hooks`, letting a Preact
 * app consume the animation hooks WITHOUT pulling in `preact/compat`.
 */

export type SetStateAction<S> = S | ((prev: S) => S);
export type Dispatch<A> = (value: A) => void;

export interface MutableRef<T> {
  current: T;
}

export interface HookPrimitives {
  useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  useRef<T>(initialValue: T): MutableRef<T>;
  useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: ReadonlyArray<unknown>,
  ): T;
}
