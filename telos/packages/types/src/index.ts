export type ExecResult = { stdout: string; stderr: string; code: number }
export type SnapId = string
export type Volume = { id: string; mount: string }
export type Health = "unknown" | "up" | "down" | "degraded"

export type EngineLane = "bevy" | "godot-cs" | "unity-cli" | "unreal-cmd"

export type InputAction =
  | { t: number; type: "tap"; x: number; y: number }
  | { t: number; type: "key"; key: string; down?: boolean }
  | { t: number; type: "swipe"; from: [number, number]; to: [number, number] }

export type InputTape = { duration: number; fps: number; actions: InputAction[] }

export type WorldEntity = {
  id: string
  x: number
  y: number
  vx?: number
  vy?: number
  flags?: string[]
}

export type WorldState = {
  tick: number
  entities: WorldEntity[]
  score?: number
  events?: string[]
}

export type Playproof = {
  clipPath?: string
  lastFramePath: string
  world: WorldState
  log: string
  checks: Record<string, boolean>
}

export type CookTarget = "android" | "ios" | "linux" | "windows" | "macos"
export type Artifact = { target: CookTarget; path: string; sha256: string; jobId: string }

export type Diagnostic = {
  file: string
  line: number
  level: "error" | "warning"
  msg: string
}

export type AppSpec = {
  name: string
  repo: string
  branch: string
  env: Record<string, string>
  domain?: string
}

export type Release = { id: string; url?: string; status: string }

export interface Sandbox {
  create(opts: Record<string, unknown>): Promise<{ id: string }>
  exec(cmd: string): Promise<ExecResult>
  write(path: string, content: string): Promise<void>
  expose(port: number): Promise<string>
  snapshot(): Promise<SnapId>
  destroy(): Promise<void>
}

export interface Deployer {
  deploy(spec: AppSpec): Promise<Release>
  rollback(id: string): Promise<void>
  logs(id: string): AsyncIterable<string>
  status(id: string): Promise<Health>
}

export interface NativeRuntime {
  newProject(opts: { template: string; engine: EngineLane; name: string }): Promise<{ studioId: string; root: string }>
  open(opts: { volume: Volume; engine: EngineLane }): Promise<{ studioId: string }>
  edit(files: { path: string; op: "replace" | "patch-unified"; content: string }[]): Promise<void>
  build(opts: { profile: "dev" | "release"; target: "native-host" | "android-lib" | "ios-lib" }): Promise<{ ok: true } | { ok: false; diagnostics: Diagnostic[] }>
  tick(opts: { frames: number; tape?: InputTape }): Promise<WorldState>
  frame(): Promise<{ pngPath: string; width: number; height: number; world: WorldState }>
  snapshot(): Promise<SnapId>
  reset(): Promise<void>
  cook(target: CookTarget): Promise<Artifact>
  logs(opts: { stream: "build" | "player" | "cook"; since?: number; jobId?: string }): AsyncIterable<string>
}

/** @deprecated Use NativeRuntime. Kept so old studio drivers compile while migrating. */
export interface StudioDriver extends Sandbox {
  openEditor(project: Volume): Promise<void>
  play(tape: InputTape): Promise<Playproof>
  cook(target: CookTarget): Promise<Artifact>
}
