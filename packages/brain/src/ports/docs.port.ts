import type { BrainDoc } from "../domain/docs.types";

/** External library docs, bound to the owned context7. */
export interface DocsPort {
  lookup(query: string, limit: number): Promise<BrainDoc[]>;
}

/** @deprecated Use {@link DocsPort}. Kept for backward compatibility. */
export type DocsSource = DocsPort;
