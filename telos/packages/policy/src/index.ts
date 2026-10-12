export type EnvName = "preview" | "staging" | "prod"

export function canDeploy(opts: { env: EnvName; approvalId?: string }) {
  if (opts.env === "prod") return Boolean(opts.approvalId)
  return true
}
