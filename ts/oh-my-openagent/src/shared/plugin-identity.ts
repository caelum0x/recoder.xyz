// PLUGIN_NAME / CONFIG_BASENAME are the *opencode-facing* identity: the name
// opencode uses to resolve this plugin in opencode.json and the basename of the
// on-disk plugin config files. They must stay `oh-my-openagent` so existing
// opencode installs and user configs keep resolving. Do not rebrand these.
export const PLUGIN_NAME = "oh-my-openagent"
export const LEGACY_PLUGIN_NAME = "oh-my-opencode"
export const CONFIG_BASENAME = "oh-my-openagent"
export const LEGACY_CONFIG_BASENAME = "oh-my-opencode"
export const LOG_FILENAME = "oh-my-opencode.log"
export const CACHE_DIR_NAME = "oh-my-opencode"

// Recoder ownership surface. This npm package is vendored and owned by Recoder
// as the opencode coding-agent driver behind the Conductor. RECODER_SURFACE_NAME
// is the Recoder-facing identity used in logs/diagnostics the Conductor reads;
// RECODER_PACKAGE_NAME is the published @recoder scope this build ships under.
export const RECODER_SURFACE_NAME = "recoder-opencode-harness"
export const RECODER_PACKAGE_NAME = "@recoder/opencode-harness"
