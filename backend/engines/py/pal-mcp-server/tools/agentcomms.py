"""
Agentic Communications Tool - single-call multi-model orchestration + threading.

PAL is Recoder's multi-agent communication brain. The existing workflow tools
(`consensus`, `chat`) are agent-DRIVEN: the calling agent must step through a
multi-turn workflow, capturing its own findings between model calls. That is the
right shape for a human-in-the-loop reasoning session, but Recoder's control
plane needs a *primitive* it can call once and get a structured multi-model
result back — to route a prompt to the best model, gather a consensus, or run a
stance-based debate — without owning the workflow state machine.

`agentcomms` is that primitive. It talks DIRECTLY to the real
`ModelProviderRegistry` (the same registry every other PAL tool uses) and the
real `conversation_memory` thread store, so it is a DEEP capability over the OSS,
not a shim:

  operation="route"     -> one model answers (explicit `model`, else first
                           available). The routing primitive.
  operation="consensus" -> N models answer the SAME prompt in parallel; the
                           result carries every answer for synthesis.
  operation="debate"    -> consensus with per-model stances (for/against/...),
                           i.e. an adversarial cross-model debate.
  operation="models"    -> list configured providers + available model names
                           (discovery for a routing decision). No model call.

Conversation threading: pass `continuation_id` to append this exchange to an
existing PAL thread (cross-tool memory), or `create_thread=true` to start one;
the returned `continuation_id` threads the next call.

DEGRADE-SAFE LAW: with no provider keys configured the registry exposes no
models, so every model-calling operation returns a truthful
`{"status": "no_models_available"}` with the (empty) provider list — it NEVER
fabricates a model answer. A single model failing inside a consensus is captured
as that entry's `{"status": "error"}` while the others still return.
"""

import asyncio
import json
import logging
from typing import Any, Optional

from mcp.types import TextContent

from tools.shared.base_models import ToolRequest
from tools.shared.base_tool import BaseTool

logger = logging.getLogger(__name__)

# The operations this primitive exposes. `debate` is `consensus` with stances.
_MODEL_OPERATIONS = {"route", "consensus", "debate"}
_ALL_OPERATIONS = _MODEL_OPERATIONS | {"models"}
_DEFAULT_TEMPERATURE = 0.3
_TOOL_NAME = "agentcomms"


class AgentCommsTool(BaseTool):
    """Multi-model orchestration (route / consensus / debate) + PAL threading."""

    def get_name(self) -> str:
        return _TOOL_NAME

    def get_description(self) -> str:
        return (
            "Multi-model communication primitive: route a prompt to a model, gather a "
            "consensus across models, or run a stance-based debate — in ONE call — with "
            "optional conversation threading. Use for multi-agent orchestration where you "
            "want a structured result back rather than driving a step workflow yourself."
        )

    def get_input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": sorted(_ALL_OPERATIONS),
                    "description": "route | consensus | debate | models",
                },
                "prompt": {
                    "type": "string",
                    "description": "The question/task sent to the model(s). Required for route/consensus/debate.",
                },
                "models": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "model": {"type": "string"},
                            "stance": {
                                "type": "string",
                                "enum": ["for", "against", "neutral"],
                                "default": "neutral",
                            },
                            "stance_prompt": {"type": "string"},
                        },
                        "required": ["model"],
                        "additionalProperties": False,
                    },
                    "description": (
                        "route: first entry's model is used (else first available). "
                        "consensus/debate: one entry per model to consult; `stance` drives the debate."
                    ),
                },
                "system_prompt": {
                    "type": "string",
                    "description": "Optional system instructions prepended for every model.",
                },
                "temperature": {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 1.0,
                    "description": f"Sampling temperature (default {_DEFAULT_TEMPERATURE}).",
                },
                "continuation_id": {
                    "type": "string",
                    "description": "Existing PAL thread id to append this exchange to (cross-tool memory).",
                },
                "create_thread": {
                    "type": "boolean",
                    "description": "Start a new PAL thread and return its continuation_id.",
                },
            },
            "required": ["operation"],
            "additionalProperties": False,
        }

    def get_system_prompt(self) -> str:
        # This tool orchestrates other models; it needs no model of its own.
        return ""

    def get_request_model(self):
        return ToolRequest

    def requires_model(self) -> bool:
        # We resolve + call providers ourselves, so the server's single-model
        # resolution machinery must NOT run for this tool.
        return False

    def get_annotations(self) -> Optional[dict[str, Any]]:
        # Read-only: orchestrates external model calls, mutates no local state
        # beyond the (TTL-bound) conversation thread store.
        return {"readOnlyHint": True}

    async def prepare_prompt(self, request) -> str:  # pragma: no cover - unused
        return ""

    def format_response(self, response: str, request, model_info: Optional[dict] = None) -> str:  # pragma: no cover
        return response

    async def execute(self, arguments: dict[str, Any]) -> list[TextContent]:
        """Run the requested orchestration and return a single JSON TextContent."""
        try:
            payload = await self._run(arguments or {})
        except Exception as exc:  # degrade-safe: never raise the seam
            logger.warning("agentcomms failed: %s", exc)
            payload = {"status": "error", "operation": arguments.get("operation"), "error": str(exc)}
        return [TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))]

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------
    async def _run(self, args: dict[str, Any]) -> dict[str, Any]:
        operation = str(args.get("operation") or "").strip().lower()
        if operation not in _ALL_OPERATIONS:
            return {"status": "bad_request", "error": f"unknown operation '{operation}'", "operations": sorted(_ALL_OPERATIONS)}

        if operation == "models":
            return self._list_models()

        prompt = str(args.get("prompt") or "").strip()
        if not prompt:
            return {"status": "bad_request", "operation": operation, "error": "prompt is required"}

        available = self._available_model_names()
        if not available:
            # DEGRADE-SAFE: no provider keys configured -> no models. Truthful, no fabrication.
            return {
                "status": "no_models_available",
                "operation": operation,
                "providers": self._provider_names(),
                "reason": "no model providers are configured (missing API keys)",
            }

        system_prompt = args.get("system_prompt")
        temperature = _coerce_temperature(args.get("temperature"))

        # Conversation threading (cross-tool PAL memory) — degrade-safe.
        continuation_id, thread_status = self._resolve_thread(args, prompt)

        if operation == "route":
            result = await self._route(prompt, args.get("models"), available, system_prompt, temperature)
        else:  # consensus | debate
            result = await self._consensus(
                prompt,
                args.get("models"),
                available,
                system_prompt,
                temperature,
                require_stance=(operation == "debate"),
            )

        if continuation_id:
            self._record_turns(continuation_id, prompt, result)
            result["continuation_id"] = continuation_id
        if thread_status:
            result["thread_status"] = thread_status
        result["operation"] = operation
        return result

    async def _route(
        self,
        prompt: str,
        models_arg: Any,
        available: list[str],
        system_prompt: Optional[str],
        temperature: float,
    ) -> dict[str, Any]:
        """Route to an explicit model (first `models` entry) or the first available one."""
        requested = _first_model_name(models_arg)
        model_name = requested or available[0]
        answer = await self._call_model(model_name, prompt, system_prompt, temperature)
        return {"status": answer["status"], "model": model_name, "requested_model": requested, "answer": answer}

    async def _consensus(
        self,
        prompt: str,
        models_arg: Any,
        available: list[str],
        system_prompt: Optional[str],
        temperature: float,
        require_stance: bool,
    ) -> dict[str, Any]:
        """Query every requested model in parallel and collect their answers."""
        configs = _normalize_model_configs(models_arg, available, require_stance)
        if not configs:
            return {"status": "bad_request", "error": "at least one model is required for consensus/debate"}

        async def one(cfg: dict[str, str]) -> dict[str, Any]:
            stance = cfg.get("stance", "neutral")
            merged_system = _apply_stance(system_prompt, stance, cfg.get("stance_prompt"))
            answer = await self._call_model(cfg["model"], prompt, merged_system, temperature)
            return {"model": cfg["model"], "stance": stance, **answer}

        responses = await asyncio.gather(*(one(cfg) for cfg in configs))
        succeeded = [r for r in responses if r.get("status") == "ok"]
        return {
            "status": "ok" if succeeded else "all_failed",
            "models_consulted": [f"{c['model']}:{c.get('stance', 'neutral')}" for c in configs],
            "responses": responses,
            "succeeded": len(succeeded),
            "failed": len(responses) - len(succeeded),
        }

    async def _call_model(
        self,
        model_name: str,
        prompt: str,
        system_prompt: Optional[str],
        temperature: float,
    ) -> dict[str, Any]:
        """One real provider call, off the event loop; degrade-safe per model."""
        from providers.registry import ModelProviderRegistry

        provider = ModelProviderRegistry.get_provider_for_model(model_name)
        if provider is None:
            return {"status": "error", "error": f"no provider available for model '{model_name}'"}
        try:
            response = await asyncio.to_thread(
                provider.generate_content,
                prompt=prompt,
                model_name=model_name,
                system_prompt=system_prompt,
                temperature=temperature,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {
            "status": "ok",
            "content": getattr(response, "content", ""),
            "model_name": getattr(response, "model_name", model_name),
            "friendly_name": getattr(response, "friendly_name", ""),
            "usage": getattr(response, "usage", {}) or {},
        }

    # ------------------------------------------------------------------
    # Model discovery
    # ------------------------------------------------------------------
    def _list_models(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "operation": "models",
            "providers": self._provider_names(),
            "models": self._available_model_names(),
        }

    def _available_model_names(self) -> list[str]:
        try:
            from providers.registry import ModelProviderRegistry

            return sorted(ModelProviderRegistry.get_available_model_names())
        except Exception as exc:  # degrade-safe discovery
            logger.debug("agentcomms model discovery failed: %s", exc)
            return []

    def _provider_names(self) -> list[str]:
        try:
            from providers.registry import ModelProviderRegistry

            return sorted(p.value for p in ModelProviderRegistry.get_available_providers())
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Threading
    # ------------------------------------------------------------------
    def _resolve_thread(self, args: dict[str, Any], prompt: str) -> tuple[Optional[str], Optional[str]]:
        """Return (continuation_id, status). Degrade-safe: threading never blocks an answer."""
        continuation_id = args.get("continuation_id")
        if isinstance(continuation_id, str) and continuation_id.strip():
            cid = continuation_id.strip()
            try:
                from utils.conversation_memory import get_thread

                if get_thread(cid) is None:
                    return cid, "thread_not_found"
                return cid, "continued"
            except Exception as exc:
                logger.debug("agentcomms thread lookup failed: %s", exc)
                return cid, "thread_unavailable"
        if args.get("create_thread"):
            try:
                from utils.conversation_memory import create_thread

                cid = create_thread(_TOOL_NAME, {"prompt": prompt, "operation": args.get("operation")})
                return cid, "created"
            except Exception as exc:
                logger.debug("agentcomms thread creation failed: %s", exc)
                return None, "thread_unavailable"
        return None, None

    def _record_turns(self, continuation_id: str, prompt: str, result: dict[str, Any]) -> None:
        """Append the user prompt + each model answer to the thread. Best-effort."""
        try:
            from utils.conversation_memory import add_turn
        except Exception as exc:
            logger.debug("agentcomms add_turn import failed: %s", exc)
            return
        try:
            add_turn(continuation_id, "user", prompt, tool_name=_TOOL_NAME)
            for turn in _answer_turns(result):
                add_turn(
                    continuation_id,
                    "assistant",
                    turn["content"],
                    tool_name=_TOOL_NAME,
                    model_name=turn.get("model_name"),
                )
        except Exception as exc:  # threading is best-effort; the answer still returns
            logger.debug("agentcomms record_turns failed: %s", exc)


def _answer_turns(result: dict[str, Any]) -> list[dict[str, str]]:
    """Extract (content, model_name) turns from a route or consensus result."""
    turns: list[dict[str, str]] = []
    answer = result.get("answer")
    if isinstance(answer, dict) and answer.get("status") == "ok" and answer.get("content"):
        turns.append({"content": str(answer["content"]), "model_name": str(answer.get("model_name", ""))})
    for resp in result.get("responses", []) or []:
        if isinstance(resp, dict) and resp.get("status") == "ok" and resp.get("content"):
            turns.append({"content": str(resp["content"]), "model_name": str(resp.get("model_name", ""))})
    return turns


def _first_model_name(models_arg: Any) -> Optional[str]:
    if isinstance(models_arg, list) and models_arg:
        first = models_arg[0]
        if isinstance(first, dict):
            name = first.get("model")
            return name.strip() if isinstance(name, str) and name.strip() else None
        if isinstance(first, str) and first.strip():
            return first.strip()
    if isinstance(models_arg, str) and models_arg.strip():
        return models_arg.strip()
    return None


def _normalize_model_configs(models_arg: Any, available: list[str], require_stance: bool) -> list[dict[str, str]]:
    """Coerce the `models` arg into unique {model, stance, stance_prompt} configs.

    When none are supplied for a consensus we fall back to every available model
    (neutral stance). A debate REQUIRES explicit models (stances are the point).
    """
    configs: list[dict[str, str]] = []
    seen: set[str] = set()
    if isinstance(models_arg, list):
        for entry in models_arg:
            name: Optional[str] = None
            stance = "neutral"
            stance_prompt: Optional[str] = None
            if isinstance(entry, dict):
                raw = entry.get("model")
                name = raw.strip() if isinstance(raw, str) and raw.strip() else None
                if isinstance(entry.get("stance"), str):
                    stance = entry["stance"].strip() or "neutral"
                if isinstance(entry.get("stance_prompt"), str):
                    stance_prompt = entry["stance_prompt"]
            elif isinstance(entry, str) and entry.strip():
                name = entry.strip()
            if not name:
                continue
            key = f"{name}:{stance}"
            if key in seen:
                continue
            seen.add(key)
            cfg: dict[str, str] = {"model": name, "stance": stance}
            if stance_prompt:
                cfg["stance_prompt"] = stance_prompt
            configs.append(cfg)
    if configs:
        return configs
    if require_stance:
        return []
    # Consensus fallback: consult everything available, neutral stance.
    return [{"model": name, "stance": "neutral"} for name in available]


def _apply_stance(system_prompt: Optional[str], stance: str, stance_prompt: Optional[str]) -> Optional[str]:
    """Fold a debate stance into the system prompt (custom stance_prompt wins)."""
    if stance == "neutral" and not stance_prompt:
        return system_prompt
    if stance_prompt:
        directive = stance_prompt
    elif stance == "for":
        directive = "Argue IN FAVOR of the proposal. Marshal the strongest supporting case."
    elif stance == "against":
        directive = "Argue AGAINST the proposal. Marshal the strongest critical case."
    else:
        directive = f"Adopt a '{stance}' stance."
    return f"{system_prompt}\n\n{directive}" if system_prompt else directive


def _coerce_temperature(value: Any) -> float:
    try:
        temp = float(value)
    except (TypeError, ValueError):
        return _DEFAULT_TEMPERATURE
    return min(1.0, max(0.0, temp))
