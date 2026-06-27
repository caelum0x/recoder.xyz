declare const runIdBrand: unique symbol;

/** Branded identifier for a single runtime run. */
export type RunId = string & { readonly [runIdBrand]: true };

export function makeRunId(seed?: string): RunId {
  const base = seed && seed.length > 0 ? seed : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `run_${base}` as RunId;
}

export function asRunId(value: string): RunId {
  return value as RunId;
}
