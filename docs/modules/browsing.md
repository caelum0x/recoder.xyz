# BROWSING module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/browser-use + @recoder/agent-browser

**Interface:** `open · snapshot · extract · verify · navigate · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §BROWSING.

**Shipped today (not yet a standalone `domains/browsing/`).** Browsing is served
under the **ENGINES domain**. The live functional path is TS-first:
`backend/src/domains/engines/browser-use-engine.ts` composes the owned
`@recoder/agent-browser` over a degrade-safe driver — puppeteer (dynamic import) OR
the HTTP `browser-use` sidecar when `BROWSER_USE_URL` is set — and registers the real
`browser.navigate / browser.extract / browser.screenshot` handlers behind the interop
gate. **Shipped (feat/enterprise-s0-p0):** four higher-level browser-use tools are now
real-bound and degrade-truthful alongside the base handlers —
`browser.extract_structured` (schema-guided structured extraction),
`browser.run_task` (natural-language agent task drive-to-completion),
`browser.screenshot_annotate` (screenshot with element/region annotations), and
`browser.fill_form` (multi-field form fill). Each reports `not_configured` when no
driver is present rather than faking success. With neither driver present, tools return a truthful `not_configured` (the
desktop still boots). The Python `backend/engines/py/browser-use` agent is a
**supervised sidecar** (`BrowserUseAdapter` at
`backend/src/domains/engines/adapters/sidecar/browser-use.adapter.ts`, health `up`
only when the uv venv answers over the sidecar seam).

**Agent-facing MCP tools (governed).** The public `recoder_*` ids agents actually call
— bridged through the gated MCP host (`POST /api/mcp/tools/:server/:tool/call`,
`authorize → risk → execute → audit`) by `mcp/recoder-capability-tools.cjs` — map onto
the engine verbs above: `recoder_browser_open` → `browser.open`,
`recoder_browser_snapshot` → `browser.snapshot`, and `recoder_browser_verify` →
`browser.verify` (all on the `recoder.browser` server); `recoder_browser_navigate` →
`browser.navigate` and `recoder_browser_extract` → `browser.extract` (on the
`recoder.browser-use` server). Each degrades to a truthful "not available" / "not
configured" string when the driver or interop key is absent — never a faked page.

**Planned (not yet shipped).** A single unified `BrowsingModule` at
`backend/src/domains/browsing/` exposing the full `open · snapshot · extract · verify ·
navigate` surface with the browser-use owned-venv sidecar running by default,
session/profile management, a governance domain-allowlist, and artifact capture.
