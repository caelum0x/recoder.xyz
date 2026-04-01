"""
Smolagents Executor — Code-first agent execution loop.

Wraps agent tool calls in HuggingFace Smolagents' code-first execution model:
  1. Agent receives task description
  2. Agent writes Python code to call tools
  3. Code executes in Daytona sandbox
  4. Output returned to LLM for evaluation
  5. LLM iterates until task is complete

This gives agents a proper "write code → run code → see output → fix code" loop
instead of single-shot tool calls.

Usage:
    executor = SmolagentsExecutor(sandbox_id="...", daytona_url="...", api_key="...")
    result = await executor.run("Create a REST API for user management")
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 10
EXECUTION_TIMEOUT = 120  # seconds per code execution


@dataclass
class ExecutionStep:
    """A single step in the code-first execution loop."""

    iteration: int
    code: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int


@dataclass
class ExecutionResult:
    """Final result of a Smolagents execution run."""

    task: str
    success: bool
    output: str
    steps: list[ExecutionStep] = field(default_factory=list)
    total_iterations: int = 0
    error: str | None = None


class SmolagentsExecutor:
    """
    Code-first agent executor using Smolagents patterns.

    The executor manages a loop where the LLM generates Python code,
    which is executed in a sandboxed environment, and the output is
    fed back to the LLM for further iteration.
    """

    def __init__(
        self,
        sandbox_id: str,
        daytona_url: str = "http://localhost:3900/api",
        daytona_api_key: str = "",
        llm_provider: str = "openrouter",
        llm_api_key: str = "",
        model: str = "anthropic/claude-sonnet-4-20250514",
    ):
        self.sandbox_id = sandbox_id
        self.daytona_url = daytona_url.rstrip("/")
        self.daytona_api_key = daytona_api_key
        self.llm_provider = llm_provider
        self.llm_api_key = llm_api_key
        self.model = model

    async def run(self, task: str, context: str = "") -> ExecutionResult:
        """Execute a task using the code-first loop."""
        steps: list[ExecutionStep] = []
        history: list[dict[str, str]] = []

        system_prompt = self._build_system_prompt(context)
        history.append({"role": "user", "content": f"Task: {task}"})

        for iteration in range(1, MAX_ITERATIONS + 1):
            # Ask LLM to generate code
            code = await self._generate_code(system_prompt, history)
            if not code:
                return ExecutionResult(
                    task=task,
                    success=False,
                    output="LLM did not generate executable code",
                    steps=steps,
                    total_iterations=iteration,
                    error="no_code_generated",
                )

            # Check for completion signal
            if "##TASK_COMPLETE##" in code:
                final_output = code.replace("##TASK_COMPLETE##", "").strip()
                return ExecutionResult(
                    task=task,
                    success=True,
                    output=final_output or f"Task completed in {iteration} iterations",
                    steps=steps,
                    total_iterations=iteration,
                )

            # Execute code in sandbox
            step = await self._execute_in_sandbox(code, iteration)
            steps.append(step)

            # Feed result back to LLM
            execution_feedback = (
                f"Iteration {iteration} result:\n"
                f"Exit code: {step.exit_code}\n"
                f"Stdout:\n{step.stdout[:2000]}\n"
            )
            if step.stderr:
                execution_feedback += f"Stderr:\n{step.stderr[:1000]}\n"

            history.append({"role": "assistant", "content": f"```python\n{code}\n```"})
            history.append({"role": "user", "content": execution_feedback})

            logger.info(
                "Iteration %d: exit_code=%d stdout_len=%d",
                iteration,
                step.exit_code,
                len(step.stdout),
            )

        return ExecutionResult(
            task=task,
            success=False,
            output=f"Reached max iterations ({MAX_ITERATIONS})",
            steps=steps,
            total_iterations=MAX_ITERATIONS,
            error="max_iterations_reached",
        )

    def _build_system_prompt(self, context: str) -> str:
        """Build the system prompt for code-first execution."""
        return f"""You are a code-first agent. You solve tasks by writing and executing Python code.

Rules:
1. Write Python code to accomplish the task step by step.
2. Your code will be executed in a sandbox with Python 3.11, Node.js 22, and shell access.
3. Use subprocess.run() to execute shell commands.
4. After each execution, you'll see the output. Fix errors and iterate.
5. When the task is complete, respond with ##TASK_COMPLETE## followed by a summary.
6. Keep code focused — one logical step per iteration.
7. Available in the sandbox: git, npm, pip, curl, wget, python3, node.

{f"Context: {context}" if context else ""}

Respond with ONLY Python code (no markdown fences, no explanation).
If the task is done, respond with ##TASK_COMPLETE## and a summary."""

    async def _generate_code(
        self, system_prompt: str, history: list[dict[str, str]]
    ) -> str:
        """Call the LLM to generate Python code."""
        messages = [{"role": "system", "content": system_prompt}, *history]

        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"model": self.model, "messages": messages, "max_tokens": 4096},
                    timeout=aiohttp.ClientTimeout(total=60),
                )
                data = await resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # Strip markdown code fences if present
                if content.startswith("```python"):
                    content = content[len("```python") :].strip()
                if content.startswith("```"):
                    content = content[3:].strip()
                if content.endswith("```"):
                    content = content[:-3].strip()
                return content
        except Exception as exc:
            logger.warning("LLM call failed: %s", exc)
            return ""

    async def _execute_in_sandbox(self, code: str, iteration: int) -> ExecutionStep:
        """Execute Python code in the Daytona sandbox."""
        import time

        start = time.monotonic()
        command = f"python3 -c {json.dumps(code)}"

        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.daytona_url}/toolbox/{self.sandbox_id}/toolbox/process/execute"
                resp = await session.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self.daytona_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"command": f"sh -c {json.dumps(command)}"},
                    timeout=aiohttp.ClientTimeout(total=EXECUTION_TIMEOUT),
                )
                data = await resp.json()
                duration_ms = int((time.monotonic() - start) * 1000)

                return ExecutionStep(
                    iteration=iteration,
                    code=code,
                    stdout=data.get("result", data.get("stdout", "")),
                    stderr=data.get("stderr", ""),
                    exit_code=data.get("exitCode", data.get("exit_code", -1)),
                    duration_ms=duration_ms,
                )
        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            return ExecutionStep(
                iteration=iteration,
                code=code,
                stdout="",
                stderr=f"Sandbox execution error: {exc}",
                exit_code=-1,
                duration_ms=duration_ms,
            )
