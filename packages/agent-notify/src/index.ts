/**
 * @recoder/agent-notify — the owned NOTIFY engine (RECODER-ENGINES). Send a single
 * human-facing notification (delivery ready, review needed) to a configured
 * webhook, with `fetch` + `env` injected and every path degrade-safe.
 */
export {
	createNotifyEngine,
	type NotifyEngine,
	type NotifyEngineDeps,
	type NotifyEnv,
	type NotifyFetch,
	type NotifyHttpResponse,
	type NotifyInput,
	type NotifyLevel,
	type NotifyResult,
	type NotifyStatus,
} from "./notify-engine.js";
