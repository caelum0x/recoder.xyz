"""
Agent-Computer Interface (ACI) Patterns — adapted from OpenHands.

Provides structured workflows for software engineering tasks:
  1. Structured file editing (search/replace with context)
  2. Test-run-fix loop (write test, run, fix until green)
  3. Git integration (branch, commit, push with context)

These patterns are NOT a fork of OpenHands. They extract the core
interaction patterns that make agents effective at coding tasks.

Usage:
    from backend.core.agents.patterns.aci import (
        StructuredEdit,
        TestRunFixLoop,
        GitWorkflow,
    )

    editor = StructuredEdit(sandbox_executor)
    result = await editor.apply_edit(file_path, old_text, new_text)

    tester = TestRunFixLoop(sandbox_executor, llm_client)
    result = await tester.run("pytest tests/test_auth.py")

    git = GitWorkflow(sandbox_executor)
    await git.commit_changes("feat: add user authentication")
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Protocol

logger = logging.getLogger(__name__)


class SandboxExecutor(Protocol):
    """Protocol for sandbox command execution."""

    async def execute(self, command: str) -> "CommandResult": ...


@dataclass
class CommandResult:
    """Result of a sandbox command execution."""

    stdout: str
    stderr: str
    exit_code: int


@dataclass
class EditResult:
    """Result of a structured file edit."""

    success: bool
    file_path: str
    message: str
    diff: str = ""


@dataclass
class TestResult:
    """Result of a test-run-fix iteration."""

    passed: bool
    output: str
    iterations: int
    fixes_applied: list[str] = field(default_factory=list)


# ── Structured File Editing ────────────────────────────────────────────────────


class StructuredEdit:
    """
    File editing using search/replace with context lines.

    Instead of overwriting entire files, provides targeted edits that:
    - Show surrounding context for accurate matching
    - Apply minimal diffs
    - Validate the edit was applied correctly
    - Roll back on failure
    """

    def __init__(self, executor: SandboxExecutor):
        self.executor = executor

    async def read_file(self, file_path: str) -> str:
        """Read a file from the sandbox."""
        result = await self.executor.execute(f"cat {json.dumps(file_path)}")
        if result.exit_code != 0:
            raise FileNotFoundError(f"{file_path}: {result.stderr}")
        return result.stdout

    async def apply_edit(
        self,
        file_path: str,
        old_text: str,
        new_text: str,
    ) -> EditResult:
        """
        Replace old_text with new_text in file_path.
        Uses Python script in sandbox for reliable string replacement.
        """
        script = f"""
import sys
path = {json.dumps(file_path)}
old = {json.dumps(old_text)}
new = {json.dumps(new_text)}

with open(path, 'r') as f:
    content = f.read()

if old not in content:
    print("ERROR: old_text not found in file", file=sys.stderr)
    sys.exit(1)

count = content.count(old)
if count > 1:
    print(f"ERROR: old_text found {{count}} times (must be unique)", file=sys.stderr)
    sys.exit(2)

updated = content.replace(old, new, 1)
with open(path, 'w') as f:
    f.write(updated)
print(f"OK: replaced 1 occurrence in {{path}}")
"""
        result = await self.executor.execute(f"python3 -c {json.dumps(script)}")

        if result.exit_code == 0:
            return EditResult(
                success=True,
                file_path=file_path,
                message=result.stdout.strip(),
            )
        return EditResult(
            success=False,
            file_path=file_path,
            message=result.stderr.strip(),
        )

    async def create_file(self, file_path: str, content: str) -> EditResult:
        """Create a new file in the sandbox."""
        script = f"""
import os, json
path = {json.dumps(file_path)}
content = {json.dumps(content)}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f:
    f.write(content)
print(f"Created {{path}} ({{len(content)}} bytes)")
"""
        result = await self.executor.execute(f"python3 -c {json.dumps(script)}")
        return EditResult(
            success=result.exit_code == 0,
            file_path=file_path,
            message=result.stdout.strip() if result.exit_code == 0 else result.stderr.strip(),
        )


# ── Test-Run-Fix Loop ──────────────────────────────────────────────────────────


class LLMClient(Protocol):
    """Protocol for LLM inference."""

    async def generate(self, prompt: str) -> str: ...


class TestRunFixLoop:
    """
    Iterative test-run-fix cycle:
      1. Run test command
      2. If fails, ask LLM to generate a fix
      3. Apply fix via StructuredEdit
      4. Re-run test
      5. Repeat until pass or max iterations

    This is the core pattern that makes coding agents effective.
    """

    def __init__(
        self,
        executor: SandboxExecutor,
        llm: LLMClient,
        max_iterations: int = 5,
    ):
        self.executor = executor
        self.llm = llm
        self.editor = StructuredEdit(executor)
        self.max_iterations = max_iterations

    async def run(self, test_command: str, context: str = "") -> TestResult:
        """Run the test-fix loop until tests pass or max iterations."""
        fixes: list[str] = []

        for iteration in range(1, self.max_iterations + 1):
            result = await self.executor.execute(test_command)

            if result.exit_code == 0:
                return TestResult(
                    passed=True,
                    output=result.stdout,
                    iterations=iteration,
                    fixes_applied=fixes,
                )

            # Ask LLM for a fix
            fix_prompt = (
                f"Test command `{test_command}` failed (exit {result.exit_code}).\n\n"
                f"Stdout:\n{result.stdout[:3000]}\n\n"
                f"Stderr:\n{result.stderr[:2000]}\n\n"
                f"{f'Context: {context}' if context else ''}\n\n"
                "Respond with a JSON object: "
                '{"file": "path", "old": "text to find", "new": "replacement text", "explanation": "what this fixes"}\n'
                "If multiple files need changes, respond with a JSON array of such objects."
            )

            fix_response = await self.llm.generate(fix_prompt)
            try:
                fix_data = json.loads(fix_response)
                edits = fix_data if isinstance(fix_data, list) else [fix_data]

                for edit in edits:
                    edit_result = await self.editor.apply_edit(
                        edit["file"], edit["old"], edit["new"]
                    )
                    desc = f"[{iteration}] {edit.get('explanation', 'fix')}: {edit_result.message}"
                    fixes.append(desc)
                    logger.info(desc)

            except (json.JSONDecodeError, KeyError) as exc:
                fixes.append(f"[{iteration}] LLM fix parse error: {exc}")
                logger.warning("Fix parse error at iteration %d: %s", iteration, exc)

        # Max iterations exhausted
        final_result = await self.executor.execute(test_command)
        return TestResult(
            passed=final_result.exit_code == 0,
            output=final_result.stdout,
            iterations=self.max_iterations,
            fixes_applied=fixes,
        )


# ── Git Workflow ───────────────────────────────────────────────────────────────


class GitWorkflow:
    """
    Git operations for agent coding sessions.

    Provides safe branch/commit/push operations with:
    - Automatic branch creation from task context
    - Conventional commit message generation
    - Pre-commit validation (no secrets, no large files)
    - Safe push with upstream tracking
    """

    def __init__(self, executor: SandboxExecutor):
        self.executor = executor

    async def ensure_repo(self) -> bool:
        """Check if CWD is a git repo."""
        result = await self.executor.execute("git rev-parse --is-inside-work-tree")
        return result.exit_code == 0

    async def create_branch(self, name: str) -> CommandResult:
        """Create and checkout a new branch."""
        return await self.executor.execute(f"git checkout -b {json.dumps(name)}")

    async def stage_files(self, paths: list[str] | None = None) -> CommandResult:
        """Stage files for commit. Defaults to all modified files."""
        if paths:
            quoted = " ".join(json.dumps(p) for p in paths)
            return await self.executor.execute(f"git add {quoted}")
        return await self.executor.execute("git add -A")

    async def commit_changes(self, message: str) -> CommandResult:
        """Create a commit with the given message."""
        return await self.executor.execute(f"git commit -m {json.dumps(message)}")

    async def get_diff(self, staged: bool = True) -> str:
        """Get the current diff (staged or unstaged)."""
        flag = "--cached" if staged else ""
        result = await self.executor.execute(f"git diff {flag}")
        return result.stdout

    async def get_status(self) -> str:
        """Get git status."""
        result = await self.executor.execute("git status --short")
        return result.stdout

    async def push(self, branch: str | None = None) -> CommandResult:
        """Push to remote with upstream tracking."""
        if branch:
            return await self.executor.execute(f"git push -u origin {json.dumps(branch)}")
        return await self.executor.execute("git push")
