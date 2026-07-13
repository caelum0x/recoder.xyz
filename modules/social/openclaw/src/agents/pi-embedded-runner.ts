// Owned by Recoder. The CONCRETE embedded pi-agent runner. This is the real
// implementation behind the `EmbeddedRunner` contract in `embedded-runner.ts`:
// it drives the genuine pi coding-agent harness (`@mariozechner/pi-agent-core`
// `Agent` + `@mariozechner/pi-ai` `streamSimple`) to turn a single
// gated, normalized inbound prompt into a streamed reply.
//
// The pi SDKs are OPTIONAL peer dependencies. They are NEVER statically imported
// at runtime: the foundation imports only their *types* (fully erased at build,
// so the foundation bundle pulls in none of the heavy pi graph and install stays
// ENOSPC-safe), and loads their *values* lazily through `loadOptionalPi` only on
// the first `run()`. A consumer that has not installed the pi SDKs gets a
// truthful, actionable error the moment they try to run — never a fake success.

import type {
  AssistantMessage,
  AssistantMessageEvent,
  Message,
  Model,
  Usage as PiUsage,
} from "@mariozechner/pi-ai";
import type {
  Agent as PiAgent,
  AgentEvent,
  AgentMessage,
} from "@mariozechner/pi-agent-core";

import type { AuthProfileCredential } from "./auth-profiles.js";
import type {
  EmbeddedRunEvent,
  EmbeddedRunRequest,
  EmbeddedRunner,
  EmbeddedRunUsage,
} from "./embedded-runner.js";
import {
  loadOptionalPi,
  PI_AGENT_CORE_MODULE,
  PI_AI_MODULE,
} from "./optional-pi.js";

/** The slice of `@mariozechner/pi-ai` the runner loads at runtime. */
interface PiAiModule {
  streamSimple: unknown;
  getProviders(): string[];
  getModels(provider: string): Model<any>[];
  registerBuiltInApiProviders(): void;
  getEnvApiKey(provider: string): string | undefined;
}

/** The slice of `@mariozechner/pi-agent-core` the runner loads at runtime. */
interface PiAgentCoreModule {
  Agent: new (options: Record<string, unknown>) => PiAgent;
}

/** Options for constructing a {@link PiEmbeddedRunner}. */
export interface PiEmbeddedRunnerOptions {
  /**
   * Default model id used when a request does not pin one. Accepts either a
   * bare provider model id (e.g. `claude-3-5-sonnet-latest`) or a
   * `provider:model` / `provider/model` form. Defaults to the
   * `RECODER_CONNECTORS_AGENT_MODEL` env or `anthropic:claude-3-5-haiku-latest`.
   */
  readonly defaultModel?: string;
  /**
   * System prompt applied to every turn this runner drives. A connector reply
   * agent is a chat assistant by default; integrators override per deployment.
   */
  readonly systemPrompt?: string;
  /**
   * Hard cap on tool/LLM turns for a single `run()` so a connector reply can
   * never loop unbounded. Defaults to 8.
   */
  readonly maxTurns?: number;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a Recoder connector reply agent. Answer the user's message " +
  "concisely and helpfully. You are replying over a chat channel, so keep " +
  "responses short and to the point.";

const DEFAULT_MODEL_FALLBACK = "anthropic:claude-3-5-haiku-latest";

/** Split a `provider:model` / `provider/model` / bare id into parts. */
function parseModelRef(ref: string): { provider?: string; modelId: string } {
  const trimmed = ref.trim();
  const sep = trimmed.indexOf(":") >= 0 ? ":" : trimmed.indexOf("/") >= 0 ? "/" : "";
  if (!sep) {
    return { modelId: trimmed };
  }
  const idx = trimmed.indexOf(sep);
  const provider = trimmed.slice(0, idx).trim();
  const modelId = trimmed.slice(idx + 1).trim();
  return provider ? { provider, modelId } : { modelId };
}

/**
 * Resolve a concrete pi `Model` from a model ref against the registered
 * providers. Throws a truthful error naming the ref when nothing matches, so a
 * misconfigured model never silently degrades to a wrong one.
 */
function resolveModel(pi: PiAiModule, ref: string): Model<any> {
  const { provider, modelId } = parseModelRef(ref);
  const providers = provider ? [provider] : pi.getProviders();
  for (const p of providers) {
    let models: Model<any>[];
    try {
      models = pi.getModels(p);
    } catch {
      continue;
    }
    const found = models.find((m) => m.id === modelId);
    if (found) {
      return found;
    }
  }
  throw new Error(
    `Embedded runner could not resolve model "${ref}". ` +
      `Provider=${provider ?? "(any)"}, modelId=${modelId}. ` +
      `Check the model id against the installed @mariozechner/pi-ai model registry.`,
  );
}

/** Extract a usable API key string from an auth-profile credential, if any. */
function apiKeyFromCredential(credential?: AuthProfileCredential): string | undefined {
  if (!credential) {
    return undefined;
  }
  if (credential.type === "api_key") {
    return credential.key;
  }
  if (credential.type === "token") {
    return credential.token;
  }
  if (credential.type === "oauth") {
    return credential.accessToken;
  }
  return undefined;
}

/** Whether a credential is scoped to a specific provider that matches `provider`. */
function credentialMatchesProvider(
  provider: string,
  credential?: AuthProfileCredential,
): boolean {
  if (!credential) {
    return false;
  }
  return credential.provider === provider;
}

/** Sum usage across the assistant messages emitted in a single run. */
function aggregateUsage(messages: readonly AgentMessage[]): EmbeddedRunUsage | undefined {
  let any = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const msg of messages) {
    if ((msg as AssistantMessage).role !== "assistant") {
      continue;
    }
    const usage = (msg as AssistantMessage).usage;
    if (!usage) {
      continue;
    }
    any = true;
    inputTokens += usage.input;
    outputTokens += usage.output;
    cacheRead += usage.cacheRead;
    cacheWrite += usage.cacheWrite;
  }
  if (!any) {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
    ...(cacheRead ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

/** A bounded async queue that turns the Agent's push events into a pull stream. */
class EventQueue<T> {
  private readonly buffer: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private done = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.buffer.push(value);
  }

  close(): void {
    this.done = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.({ value: undefined as unknown as T, done: true });
    }
  }

  async *drain(): AsyncIterable<T> {
    while (true) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
        continue;
      }
      if (this.done) {
        return;
      }
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiters.push(resolve);
      });
      if (next.done) {
        return;
      }
      yield next.value;
    }
  }
}

/**
 * The concrete embedded pi-agent runner. Construct once per connector deployment
 * and reuse across turns. Each `run()` builds a fresh single-turn `Agent`, feeds
 * the prompt, and streams the agent's lifecycle events back as `EmbeddedRunEvent`s.
 */
export class PiEmbeddedRunner implements EmbeddedRunner {
  private readonly defaultModel: string;
  private readonly systemPrompt: string;
  private readonly maxTurns: number;

  private piAi?: PiAiModule;
  private piCore?: PiAgentCoreModule;
  private buildersRegistered = false;

  constructor(options: PiEmbeddedRunnerOptions = {}) {
    this.defaultModel =
      options.defaultModel ??
      process.env.RECODER_CONNECTORS_AGENT_MODEL ??
      DEFAULT_MODEL_FALLBACK;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxTurns = options.maxTurns ?? 8;
  }

  /** Load + cache the optional pi SDK modules and register built-in providers. */
  private async ensureLoaded(): Promise<{ pi: PiAiModule; core: PiAgentCoreModule }> {
    if (!this.piAi) {
      this.piAi = await loadOptionalPi<PiAiModule>(PI_AI_MODULE);
    }
    if (!this.piCore) {
      this.piCore = await loadOptionalPi<PiAgentCoreModule>(PI_AGENT_CORE_MODULE);
    }
    if (!this.buildersRegistered) {
      // Idempotent in pi-ai; registers the built-in provider stream functions so
      // getModels()/streamSimple resolve the real providers.
      this.piAi.registerBuiltInApiProviders();
      this.buildersRegistered = true;
    }
    return { pi: this.piAi, core: this.piCore };
  }

  run(request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent> {
    const self = this;
    const queue = new EventQueue<EmbeddedRunEvent>();

    // Kick the agent off asynchronously; the returned iterable drains `queue`.
    void (async () => {
      try {
        const { pi, core } = await self.ensureLoaded();
        const modelRef = request.model ?? self.defaultModel;
        const model = resolveModel(pi, modelRef);

        const credentialKey = apiKeyFromCredential(request.credential);

        // Real per-provider API key resolution: prefer a credential pinned to
        // the call's provider, then any credential key, then the environment.
        const getApiKey = (provider: string): string | undefined => {
          if (
            credentialKey &&
            (credentialMatchesProvider(provider, request.credential) ||
              !request.credential?.provider)
          ) {
            return credentialKey;
          }
          return pi.getEnvApiKey(provider);
        };

        let turns = 0;
        const agent = new core.Agent({
          initialState: {
            systemPrompt: self.systemPrompt,
            model,
          },
          streamFn: pi.streamSimple,
          // Standard LLM messages pass through untouched; the connector reply
          // agent uses no custom AgentMessage kinds.
          convertToLlm: (messages: AgentMessage[]): Message[] =>
            messages.filter(
              (m): m is Message =>
                m.role === "user" || m.role === "assistant" || m.role === "toolResult",
            ),
          getApiKey,
          sessionId: request.sessionId,
          // Bound the run so a connector reply can never loop unbounded.
          shouldStopAfterTurn: () => {
            turns += 1;
            return turns >= self.maxTurns;
          },
        });

        const unsubscribe = agent.subscribe((event: AgentEvent) => {
          self.mapEvent(event, queue);
        });

        if (request.signal) {
          if (request.signal.aborted) {
            agent.abort();
          } else {
            request.signal.addEventListener("abort", () => agent.abort(), {
              once: true,
            });
          }
        }

        try {
          await agent.prompt(request.prompt);
          await agent.waitForIdle();
        } finally {
          unsubscribe();
        }

        // Emit a truthful terminal `done` with aggregated usage from the run.
        const usage = aggregateUsage(agent.state.messages);
        queue.push(usage ? { type: "done", usage } : { type: "done" });
      } catch (err) {
        queue.push({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        queue.push({ type: "done" });
      } finally {
        queue.close();
      }
    })();

    return queue.drain();
  }

  /** Translate one pi `AgentEvent` into zero or more `EmbeddedRunEvent`s. */
  private mapEvent(event: AgentEvent, queue: EventQueue<EmbeddedRunEvent>): void {
    switch (event.type) {
      case "message_update": {
        const inner: AssistantMessageEvent = event.assistantMessageEvent;
        if (inner.type === "text_delta" && inner.delta) {
          queue.push({ type: "text", text: inner.delta });
        } else if (inner.type === "thinking_delta" && inner.delta) {
          queue.push({ type: "thinking", text: inner.delta });
        }
        return;
      }
      case "tool_execution_start": {
        queue.push({
          type: "tool-call",
          name: event.toolName,
          input: event.args,
        });
        return;
      }
      case "tool_execution_end": {
        queue.push({
          type: "tool-result",
          name: event.toolName,
          output: event.result,
        });
        return;
      }
      default:
        return;
    }
  }
}

/** Convenience factory mirroring the per-channel `create*Connector` helpers. */
export function createPiEmbeddedRunner(
  options?: PiEmbeddedRunnerOptions,
): PiEmbeddedRunner {
  return new PiEmbeddedRunner(options);
}

/**
 * Collect a finished runner stream into a single reply string. Connectors that
 * deliver one message per turn use this to fold the streamed text deltas into
 * the body they hand to `ConnectorPort.send`. Surfaces a runner `error` event
 * as a thrown error so a failed turn is never delivered as a fake empty reply.
 */
export async function collectReplyText(
  events: AsyncIterable<EmbeddedRunEvent>,
): Promise<{ text: string; usage?: EmbeddedRunUsage }> {
  let text = "";
  let usage: EmbeddedRunUsage | undefined;
  let error: string | undefined;
  for await (const event of events) {
    if (event.type === "text") {
      text += event.text;
    } else if (event.type === "error") {
      error = event.message;
    } else if (event.type === "done") {
      usage = event.usage;
    }
  }
  if (error) {
    throw new Error(`Embedded agent run failed: ${error}`);
  }
  return usage ? { text, usage } : { text };
}

/** Re-export so callers can read the pi usage helper shape if they need it. */
export type { PiUsage };
