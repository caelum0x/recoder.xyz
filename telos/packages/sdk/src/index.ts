export type TelosClientOpts = { baseUrl: string; token: string }

export function createClient(opts: TelosClientOpts) {
  return {
    async health() {
      const r = await fetch(`${opts.baseUrl}/health`)
      return r.json()
    },
  }
}
