/** Docker sandbox — first working backend. */
export const name = "sandbox-docker"

export type DockerSandboxOpts = {
  image?: string
  workdir?: string
}

export async function create(opts: DockerSandboxOpts = {}) {
  const image = opts.image ?? "docker.io/library/node:22-bookworm"
  return { id: "local-docker", image, backend: "docker" as const }
}
