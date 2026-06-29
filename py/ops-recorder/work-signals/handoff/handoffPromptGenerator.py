"""Handoff prompt generator.

Converts a ``WorkSignal`` into a ready-to-use prompt string for an AI agent
(Claude, Codex, GPT-4, etc.).

MVP: template-based generation — fast, deterministic, no external calls.
RAG upgrade path: pass ``use_rag=True`` once ChromaDB / pgvector is wired up.
The public interface stays identical, only the internals change.

Usage:
    from handoff.handoffPromptGenerator import generate_handoff
    from storage.workSignalStore import store

    signal = await store.get(signal_id)
    signal = generate_handoff(signal)          # returns a new WorkSignal with the prompt
    await store.save(signal)
"""

from __future__ import annotations

from typing import Optional

from models.workSignal import ItemType, Source, WorkSignal

# ---------------------------------------------------------------------------
# Source-specific action guidance
# ---------------------------------------------------------------------------
# These closing instructions vary by where the item lives so the agent knows
# which tool to open and what a "fix" looks like in that context.

_GITHUB_PR_CLOSING = (
    "Open the PR linked above. Read the latest review comments, check run logs, "
    "and the diff. Then:\n"
    "  1. If CI is failing — identify the failing step and propose a fix.\n"
    "  2. If changes were requested — draft a response or the corrected code.\n"
    "  3. If approved but unmerged — confirm there are no conflicts and merge, "
    "or post a comment explaining the delay."
)

_GITHUB_ISSUE_CLOSING = (
    "Open the issue linked above. Read all comments and the issue description. Then:\n"
    "  1. Confirm whether the issue is still valid.\n"
    "  2. If unassigned — suggest the right owner based on the affected code area.\n"
    "  3. Draft a concrete next step or acceptance criteria so the assignee can act immediately."
)

_LINEAR_CLOSING = (
    "Open the Linear issue linked above. Read the description, comments, and relations. Then:\n"
    "  1. If blocked — identify who owns the blocker and draft an escalation message.\n"
    "  2. If unassigned — suggest the right engineer and a target date.\n"
    "  3. If stale — draft a status update comment or propose closing it if no longer relevant."
)


def _closing_instructions(signal: WorkSignal) -> str:
    """Return the closing action block appropriate for this signal's source and type."""
    if signal.source == Source.GITHUB:
        if signal.item_type == ItemType.PULL_REQUEST:
            return _GITHUB_PR_CLOSING
        return _GITHUB_ISSUE_CLOSING
    return _LINEAR_CLOSING


# ---------------------------------------------------------------------------
# Template-based generation (MVP)
# ---------------------------------------------------------------------------

def _build_template_prompt(signal: WorkSignal) -> str:
    """Build a structured prompt from the signal's fields.

    The prompt is intentionally verbose so the agent has all the context it
    needs without needing to look anything up first.
    """
    source_label = "GitHub PR" if signal.item_type == ItemType.PULL_REQUEST else (
        "GitHub Issue" if signal.source == Source.GITHUB else "Linear Issue"
    )
    assignee_line = f"Assignee     : {signal.assignee}" if signal.assignee else "Assignee     : (unassigned)"
    status_line = f"Status       : {signal.status}" if signal.status else ""
    closing = _closing_instructions(signal)

    prompt = f"""\
You are a software operations agent. A {source_label} has been flagged as stuck and needs your attention.

─────────────────────────────────────────────
STUCK ITEM
─────────────────────────────────────────────
Title        : {signal.title}
URL          : {signal.source_url}
{assignee_line}
{status_line}
Priority     : {signal.priority.upper()}

─────────────────────────────────────────────
WHY IT IS STUCK
─────────────────────────────────────────────
{signal.detected_reason}

─────────────────────────────────────────────
WHY IT MATTERS
─────────────────────────────────────────────
{signal.why_it_matters}

─────────────────────────────────────────────
RECOMMENDED NEXT ACTION
─────────────────────────────────────────────
{signal.recommended_next_action}

─────────────────────────────────────────────
YOUR TASK
─────────────────────────────────────────────
{closing}

Respond with a structured action plan. Be specific — name files, people, or commands where relevant.
Do not ask clarifying questions. Act on the information above.
"""
    return prompt.strip()


# ---------------------------------------------------------------------------
# RAG stub (future)
# ---------------------------------------------------------------------------

def _build_rag_prompt(signal: WorkSignal) -> str:  # noqa: ARG001
    """RAG-enhanced prompt generation.

    TODO: implement when ChromaDB / pgvector is ready.
      1. Embed signal.detected_reason + signal.title.
      2. Query the vector store for the 3 most similar *resolved* signals.
      3. Inject the resolved examples into the prompt as additional context
         so the agent can see what worked last time.

    For now, falls back to the template prompt.
    """
    # Placeholder — fall through to template until RAG is wired up.
    return _build_template_prompt(signal)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_handoff(signal: WorkSignal, *, use_rag: bool = False) -> WorkSignal:
    """Generate the ``agent_handoff_prompt`` for a WorkSignal and return it.

    The function returns a **new** ``WorkSignal`` instance (Pydantic immutability)
    with ``agent_handoff_prompt`` populated. Callers should persist the returned
    object back to the store.

    Args:
        signal:  The ``WorkSignal`` to enrich.
        use_rag: When ``True``, retrieves similar resolved signals from the
                 vector store and injects them as context. Defaults to ``False``
                 (template-only) for the MVP.

    Returns:
        Updated ``WorkSignal`` with ``agent_handoff_prompt`` filled in.
    """
    if use_rag:
        prompt = _build_rag_prompt(signal)
    else:
        prompt = _build_template_prompt(signal)

    return signal.model_copy(update={"agent_handoff_prompt": prompt})
