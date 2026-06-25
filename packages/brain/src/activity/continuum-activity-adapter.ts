import { execFile } from "node:child_process";
import type { ActivityPort } from "../ports/activity.port";
import type {
  BrainActivity,
  BrainActivityProfile,
} from "../domain/activity.types";

/**
 * Default {@link ActivityPort}, backed by the continuum CLI (ts/continuum).
 *
 * continuum owns desktop-activity memory; its CLI exposes recall (semantic
 * activity search) and profile (synthesized "who is this user / how they
 * work"). This adapter shells out behind an INJECTABLE exec so the command
 * building is trivially swappable and tests inject a fake exec.
 *
 * Fail-safe doctrine: if continuum is absent or errors, recall returns [] and
 * profile returns null. This source NEVER throws — a missing source degrades.
 */

/** Runs a command and resolves its stdout (the seam the test fakes). */
export type ActivityExec = (
  command: string,
  args: string[],
) => Promise<string>;

export interface ContinuumActivityOptions {
  /** Override the exec (defaults to execFile against the continuum binary). */
  exec?: ActivityExec;
  /** Override the binary name/path (defaults to "continuum"). */
  binary?: string;
}

const DEFAULT_BINARY = "continuum";

/** Default exec: run the continuum binary and collect stdout via execFile. */
function defaultExec(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/** A continuum recall row as emitted by the CLI (untrusted external shape). */
interface ContinuumRow {
  when?: unknown;
  app?: unknown;
  who?: unknown;
  type?: unknown;
  text?: unknown;
  id?: unknown;
}

/** A continuum profile object as emitted by the CLI (untrusted external shape). */
interface ContinuumProfile {
  kind?: unknown;
  brief?: unknown;
  apps?: unknown;
  types?: unknown;
  recurring?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toWho(value: unknown): BrainActivity["who"] {
  return value === "you" || value === "others" || value === "system"
    ? value
    : "system";
}

/** Map one continuum row to a BrainActivity (boundary normalization). */
function toActivity(row: ContinuumRow): BrainActivity {
  return {
    when: str(row.when),
    app: str(row.app),
    who: toWho(row.who),
    type: str(row.type),
    text: str(row.text),
    id: str(row.id),
  };
}

/** Map a continuum profile to a BrainActivityProfile (boundary normalization). */
function toProfile(profile: ContinuumProfile): BrainActivityProfile {
  const brief = str(profile.brief);
  return {
    kind: str(profile.kind),
    ...(brief ? { brief } : {}),
    apps: strArray(profile.apps),
    tools: strArray(profile.types),
    recurring: strArray(profile.recurring),
  };
}

export class ContinuumActivity implements ActivityPort {
  private readonly exec: ActivityExec;
  private readonly binary: string;

  constructor(options: ContinuumActivityOptions = {}) {
    this.exec = options.exec ?? defaultExec;
    this.binary = options.binary ?? DEFAULT_BINARY;
  }

  async recall(query: string, limit: number): Promise<BrainActivity[]> {
    try {
      const stdout = await this.exec(this.binary, [
        "recall",
        "--json",
        "--limit",
        String(limit),
        query,
      ]);
      const parsed: unknown = JSON.parse(stdout);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((row) => toActivity(row as ContinuumRow));
    } catch {
      // Continuum absent or errored — degrade to empty, never throw.
      return [];
    }
  }

  async profile(topic?: string): Promise<BrainActivityProfile | null> {
    try {
      const args = ["profile", "--json"];
      if (topic) {
        args.push(topic);
      }
      const stdout = await this.exec(this.binary, args);
      const parsed: unknown = JSON.parse(stdout);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return toProfile(parsed as ContinuumProfile);
    } catch {
      // Continuum absent or errored — degrade to null, never throw.
      return null;
    }
  }
}

/** Construct the default continuum-backed activity adapter. */
export function createContinuumActivity(
  options?: ContinuumActivityOptions,
): ActivityPort {
  return new ContinuumActivity(options);
}
