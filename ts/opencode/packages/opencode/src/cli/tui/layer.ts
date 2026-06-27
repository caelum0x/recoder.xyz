import { run as runTui, type TuiInput } from "@recoder/opencode-tui"
import { Global } from "@recoder/opencode-core/global"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(Global.defaultLayer))
}
