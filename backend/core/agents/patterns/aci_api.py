"""
Agent-Computer Interface (ACI) REST API — exposes ACI patterns via HTTP.

Endpoints:
  POST /v1/aci/edit          — apply a structured search/replace edit to a sandbox file
  POST /v1/aci/test-fix      — run the test-run-fix loop until tests pass or max iterations
  POST /v1/aci/git/status    — git status in sandbox
  POST /v1/aci/git/diff      — git diff (staged or unstaged)
  POST /v1/aci/git/branch    — create and checkout a new branch
  POST /v1/aci/git/commit    — stage files and commit with message
"""

import logging
import time
from typing import Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.config import config
from .aci import CommandResult, EditResult, GitWorkflow, StructuredEdit, TestRunFixLoop

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aci", tags=["aci"])

EXECUTION_TIMEOUT = 120  # seconds


# ── Daytona sandbox executor ──────────────────────────────────────────────────


class DaytonaSandboxExecutor:
    """
    Concrete SandboxExecutor that runs commands in a Daytona sandbox
    via the Daytona Toolbox API.
    """

    def __init__(self, sandbox_id: str, daytona_url: str, daytona_api_key: str):
        self.sandbox_id = sandbox_id
        self._base_url = daytona_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {daytona_api_key}",
            "Content-Type": "application/json",
        }

    async def execute(self, command: str) -> CommandResult:
        url = f"{self._base_url}/toolbox/{self.sandbox_id}/toolbox/process/execute"
        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    url,
                    headers=self._headers,
                    json={"command": f"sh -c {_quote(command)}"},
                    timeout=aiohttp.ClientTimeout(total=EXECUTION_TIMEOUT),
                )
                data = await resp.json()
                return CommandResult(
                    stdout=data.get("result", data.get("stdout", "")),
                    stderr=data.get("stderr", ""),
                    exit_code=int(data.get("exitCode", data.get("exit_code", -1))),
                )
        except Exception as exc:
            logger.warning("Daytona execute error: %s", exc)
            return CommandResult(stdout="", stderr=str(exc), exit_code=-1)


def _quote(s: str) -> str:
    """Shell-quote a string for use in sh -c '...'."""
    import shlex
    return shlex.quote(s)


def _get_daytona_executor(sandbox_id: str) -> DaytonaSandboxExecutor:
    daytona_url = config.DAYTONA_SERVER_URL or "http://localhost:3900/api"
    daytona_api_key = config.DAYTONA_API_KEY or ""
    if not daytona_api_key:
        raise HTTPException(status_code=503, detail="DAYTONA_API_KEY not configured")
    return DaytonaSandboxExecutor(sandbox_id, daytona_url, daytona_api_key)


# ── Shared LLM client for test-fix loop ──────────────────────────────────────


class OpenRouterLLM:
    """Minimal LLM client using OpenRouter (matches LLMClient protocol)."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def generate(self, prompt: str) -> str:
        try:
            async with aiohttp.ClientSession() as session:
                resp = await session.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 2048,
                    },
                    timeout=aiohttp.ClientTimeout(total=60),
                )
                data = await resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")
        except Exception as exc:
            logger.warning("LLM generate failed: %s", exc)
            return ""


# ── Request / Response models ─────────────────────────────────────────────────


class EditRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    file_path: str = Field(..., description="Absolute path to file inside sandbox")
    old_text: str = Field(..., description="Text to find (must appear exactly once)")
    new_text: str = Field(..., description="Replacement text")


class EditResponse(BaseModel):
    success: bool
    file_path: str
    message: str


class CreateFileRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    file_path: str = Field(..., description="Absolute path for new file")
    content: str = Field(..., description="File content")


class TestFixRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    test_command: str = Field(..., description="Shell command to run tests")
    context: str = Field("", description="Additional context for the LLM fixer")
    max_iterations: int = Field(5, ge=1, le=10, description="Max fix iterations")
    model: str = Field("anthropic/claude-sonnet-4-20250514", description="LLM model for fix generation")


class TestFixResponse(BaseModel):
    passed: bool
    output: str
    iterations: int
    fixes_applied: list[str]


class GitStatusRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")


class GitStatusResponse(BaseModel):
    status: str
    is_repo: bool


class GitDiffRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    staged: bool = Field(True, description="True for staged diff, False for unstaged")


class GitDiffResponse(BaseModel):
    diff: str


class GitBranchRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    branch_name: str = Field(..., description="New branch name")


class GitBranchResponse(BaseModel):
    success: bool
    branch_name: str
    message: str


class GitCommitRequest(BaseModel):
    sandbox_id: str = Field(..., description="Daytona sandbox ID")
    message: str = Field(..., description="Commit message")
    paths: Optional[list[str]] = Field(None, description="Specific paths to stage (default: all)")


class GitCommitResponse(BaseModel):
    success: bool
    message: str
    stdout: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/edit", response_model=EditResponse)
async def apply_edit(
    req: EditRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> EditResponse:
    """
    Apply a targeted search/replace edit to a file in the sandbox.
    The old_text must appear exactly once in the file.
    """
    executor = _get_daytona_executor(req.sandbox_id)
    editor = StructuredEdit(executor)

    try:
        result: EditResult = await editor.apply_edit(req.file_path, req.old_text, req.new_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info("ACI edit %s: success=%s user=%s", req.file_path, result.success, user_id)
    return EditResponse(success=result.success, file_path=result.file_path, message=result.message)


@router.post("/create-file", response_model=EditResponse)
async def create_file(
    req: CreateFileRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> EditResponse:
    """Create a new file in the sandbox with the given content."""
    executor = _get_daytona_executor(req.sandbox_id)
    editor = StructuredEdit(executor)

    try:
        result: EditResult = await editor.create_file(req.file_path, req.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info("ACI create-file %s: success=%s user=%s", req.file_path, result.success, user_id)
    return EditResponse(success=result.success, file_path=result.file_path, message=result.message)


@router.post("/test-fix", response_model=TestFixResponse)
async def run_test_fix(
    req: TestFixRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> TestFixResponse:
    """
    Run the test-run-fix loop: execute test command, ask LLM to fix on failure,
    repeat until tests pass or max_iterations reached.
    """
    llm_api_key = config.OPENROUTER_API_KEY or ""
    if not llm_api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    executor = _get_daytona_executor(req.sandbox_id)
    llm = OpenRouterLLM(api_key=llm_api_key, model=req.model)
    loop = TestRunFixLoop(executor=executor, llm=llm, max_iterations=req.max_iterations)

    try:
        result = await loop.run(req.test_command, req.context)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    logger.info(
        "ACI test-fix: passed=%s iterations=%d user=%s",
        result.passed, result.iterations, user_id,
    )
    return TestFixResponse(
        passed=result.passed,
        output=result.output,
        iterations=result.iterations,
        fixes_applied=result.fixes_applied,
    )


@router.post("/git/status", response_model=GitStatusResponse)
async def git_status(
    req: GitStatusRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> GitStatusResponse:
    """Get git status for the sandbox working directory."""
    executor = _get_daytona_executor(req.sandbox_id)
    git = GitWorkflow(executor)
    is_repo = await git.ensure_repo()
    status = await git.get_status() if is_repo else ""
    return GitStatusResponse(status=status, is_repo=is_repo)


@router.post("/git/diff", response_model=GitDiffResponse)
async def git_diff(
    req: GitDiffRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> GitDiffResponse:
    """Get git diff (staged or unstaged) for the sandbox."""
    executor = _get_daytona_executor(req.sandbox_id)
    git = GitWorkflow(executor)
    diff = await git.get_diff(staged=req.staged)
    return GitDiffResponse(diff=diff)


@router.post("/git/branch", response_model=GitBranchResponse)
async def git_create_branch(
    req: GitBranchRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> GitBranchResponse:
    """Create and checkout a new branch in the sandbox."""
    executor = _get_daytona_executor(req.sandbox_id)
    git = GitWorkflow(executor)
    result = await git.create_branch(req.branch_name)
    return GitBranchResponse(
        success=result.exit_code == 0,
        branch_name=req.branch_name,
        message=result.stdout.strip() if result.exit_code == 0 else result.stderr.strip(),
    )


@router.post("/git/commit", response_model=GitCommitResponse)
async def git_commit(
    req: GitCommitRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
) -> GitCommitResponse:
    """Stage specified paths (or all) and create a commit in the sandbox."""
    executor = _get_daytona_executor(req.sandbox_id)
    git = GitWorkflow(executor)

    stage_result = await git.stage_files(req.paths)
    if stage_result.exit_code != 0:
        return GitCommitResponse(
            success=False,
            message=f"git add failed: {stage_result.stderr.strip()}",
            stdout=stage_result.stdout,
        )

    commit_result = await git.commit_changes(req.message)
    return GitCommitResponse(
        success=commit_result.exit_code == 0,
        message=commit_result.stdout.strip() if commit_result.exit_code == 0 else commit_result.stderr.strip(),
        stdout=commit_result.stdout,
    )
