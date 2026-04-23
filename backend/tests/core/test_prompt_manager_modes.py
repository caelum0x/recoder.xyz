import os

os.environ.setdefault("MCP_CREDENTIAL_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")

from core.agents.runner.prompt_manager import PromptManager


def test_prompt_manager_classifies_app_task_mode():
    assert PromptManager._classify_task_mode(
        "Build a minimal React app and make sure it runs in the sandbox preview."
    ) == "app_task"


def test_prompt_manager_does_not_classify_generic_task_as_app_task():
    assert PromptManager._classify_task_mode("Summarize this document for me.") is None


def test_build_base_prompt_includes_app_task_mode_and_skips_preloaded_guides():
    base = PromptManager._build_base_prompt("BASE", task_mode="app_task")
    assert "# APP TASK MODE" in base
    assert "deterministic workflow" in base
    assert "# PRELOADED TOOL USAGE GUIDES" not in base
