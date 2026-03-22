"""Git Operations tool for Recoder agents — clone repos, stage/commit/push/pull changes,
manage branches, and inspect working-tree status directly inside the Daytona sandbox
via the Daytona Toolbox REST API.
"""

import asyncio
from typing import Optional

import httpx

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.utils.config import config

MAX_OUTPUT_LENGTH = 10_000


def _truncate(text: str, max_len: int = MAX_OUTPUT_LENGTH) -> str:
    if len(text) <= max_len:
        return text
    half = max_len // 2
    return text[:half] + f"\n\n... [output truncated: {len(text)} chars total] ...\n\n" + text[-half:]


def _daytona_headers() -> dict:
    return {
        "Authorization": f"Bearer {config.DAYTONA_API_KEY}",
        "Content-Type": "application/json",
    }


def _daytona_url(sandbox_id: str, path: str) -> str:
    base = (config.DAYTONA_SERVER_URL or "http://localhost:3900/api").rstrip("/")
    return f"{base}/sandbox/{sandbox_id}/toolbox/{path}"


async def _git_request(
    method: str,
    sandbox_id: str,
    git_path: str,
    payload: Optional[dict] = None,
    timeout: float = 60.0,
) -> dict:
    """Call the Daytona Toolbox git REST endpoint and return parsed JSON."""
    url = _daytona_url(sandbox_id, f"git/{git_path}")
    async with httpx.AsyncClient(timeout=timeout) as client:
        if method.upper() == "GET":
            resp = await client.get(url, headers=_daytona_headers(), params=payload or {})
        else:
            resp = await client.request(
                method.upper(), url, json=payload or {}, headers=_daytona_headers()
            )
        resp.raise_for_status()
        if resp.content:
            return resp.json()
        return {}


@tool_metadata(
    display_name="GitOps",
    description="Clone repos, commit, push, pull, manage branches, and inspect git status directly inside the sandbox",
    icon="GitBranch",
    color="bg-orange-100 dark:bg-orange-800/50",
    weight=27,
    visible=True,
    usage_guide="""
## GitOps — Git operations inside the sandbox

Perform git operations (clone, status, commit, push, pull, branches) directly in
the agent's Daytona sandbox using the Daytona Toolbox git API.

### Available Actions

- **git_clone** — Clone a repository into the sandbox workspace
- **git_status** — Show working tree status
- **git_commit** — Stage all changed files and create a commit
- **git_push** — Push committed changes to the remote
- **git_branches** — List branches (local and/or remote)

### git_clone

```
git_clone(url="https://github.com/org/repo.git")
git_clone(url="https://github.com/org/repo.git", path="/workspace/myrepo", branch="main")
git_clone(url="https://github.com/org/private-repo.git", username="user", password="token")
```

- `path`: destination directory inside the sandbox (default: `/workspace`)
- `branch`: branch/tag to checkout after clone (optional)
- `username` / `password`: for authenticated clones (use a PAT as password)

### git_status

```
git_status(path="/workspace/myrepo")
```

Returns staged/unstaged/untracked files and the current branch name.

### git_commit

```
git_commit(message="feat: add new feature", path="/workspace/myrepo")
```

Stages all modified/new/deleted files (`git add -A`) then creates a commit with the
given message. Returns the new commit hash.

### git_push

```
git_push(path="/workspace/myrepo")
git_push(path="/workspace/myrepo", branch="main", username="user", password="ghp_token")
```

Pushes the current branch to origin. Supply credentials for HTTPS remotes.

### git_branches

```
git_branches(path="/workspace/myrepo")
```

Lists local branches (and which one is currently checked out).

### Notes
- All paths are inside the sandbox filesystem.
- For private repos use a personal access token (PAT) as the password — never commit credentials.
- The sandbox filesystem persists between agent turns, so a cloned repo stays available.
""",
)
class SandboxGitOpsTool(SandboxToolsBase):
    """Git operations via the Daytona Toolbox git REST API."""

    def __init__(self, project_id: str, thread_manager: Optional[ThreadManager] = None):
        super().__init__(project_id, thread_manager)

    # ------------------------------------------------------------------ #
    #  git_clone                                                            #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "git_clone",
                "description": (
                    "Clone a git repository into the sandbox. "
                    "Supports both public and private repos (provide a PAT as 'password' for HTTPS)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "HTTPS or SSH URL of the repository to clone.",
                        },
                        "path": {
                            "type": "string",
                            "description": "Target directory inside the sandbox (default: /workspace).",
                            "default": "/workspace",
                        },
                        "branch": {
                            "type": "string",
                            "description": "Branch or tag to checkout after cloning (optional).",
                        },
                        "username": {
                            "type": "string",
                            "description": "Git username for authenticated HTTPS clones.",
                        },
                        "password": {
                            "type": "string",
                            "description": "Git password or personal access token for HTTPS clones.",
                        },
                    },
                    "required": ["url"],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def git_clone(
        self,
        url: str,
        path: str = "/workspace",
        branch: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> ToolResult:
        """Clone a repository into the sandbox."""
        try:
            await self._ensure_sandbox()

            payload: dict = {"url": url, "path": path}
            if branch:
                payload["branch"] = branch
            if username:
                payload["username"] = username
            if password:
                payload["password"] = password

            result = await _git_request("POST", self.sandbox_id, "clone", payload, timeout=120.0)

            return self.success_response(
                {
                    "message": f"Repository cloned to {path}",
                    "url": url,
                    "path": path,
                    **({"branch": branch} if branch else {}),
                    **({k: v for k, v in result.items()} if result else {}),
                }
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[GitOps] git_clone HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"git clone failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[GitOps] git_clone error: {exc}", exc_info=True)
            return self.fail_response(f"Error cloning repo: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  git_status                                                           #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "git_status",
                "description": (
                    "Show the working tree status of a git repository in the sandbox: "
                    "current branch, staged files, modified files, untracked files."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the git repository inside the sandbox.",
                            "default": "/workspace",
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def git_status(self, path: str = "/workspace") -> ToolResult:
        """Show git working tree status."""
        try:
            await self._ensure_sandbox()

            result = await _git_request("GET", self.sandbox_id, "status", {"path": path})

            return self.success_response(
                {
                    "path": path,
                    **({k: v for k, v in result.items()} if result else {"raw": "no status returned"}),
                }
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[GitOps] git_status HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"git status failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[GitOps] git_status error: {exc}", exc_info=True)
            return self.fail_response(f"Error getting git status: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  git_commit (add + commit)                                            #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "git_commit",
                "description": (
                    "Stage all changed files and create a git commit. "
                    "Equivalent to `git add -A && git commit -m '<message>'`."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Commit message.",
                        },
                        "path": {
                            "type": "string",
                            "description": "Path to the git repository inside the sandbox.",
                            "default": "/workspace",
                        },
                        "author_name": {
                            "type": "string",
                            "description": "Git author name (defaults to 'Recoder Agent').",
                            "default": "Recoder Agent",
                        },
                        "author_email": {
                            "type": "string",
                            "description": "Git author email (defaults to 'agent@recoder.xyz').",
                            "default": "agent@recoder.xyz",
                        },
                    },
                    "required": ["message"],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def git_commit(
        self,
        message: str,
        path: str = "/workspace",
        author_name: str = "Recoder Agent",
        author_email: str = "agent@recoder.xyz",
    ) -> ToolResult:
        """Stage all files and commit in the sandbox git repo."""
        try:
            await self._ensure_sandbox()

            # Stage all changes first
            add_payload = {"path": path, "files": ["."]}
            await _git_request("POST", self.sandbox_id, "add", add_payload)

            # Then commit
            commit_payload = {
                "path": path,
                "message": message,
                "author": author_name,
                "email": author_email,
            }
            result = await _git_request("POST", self.sandbox_id, "commit", commit_payload)

            commit_hash = result.get("hash") or result.get("sha") or result.get("commit") or "unknown"

            return self.success_response(
                {
                    "message": f"Committed: {message}",
                    "commit_hash": commit_hash,
                    "path": path,
                    **({k: v for k, v in result.items() if k not in ("hash", "sha", "commit")} if result else {}),
                }
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[GitOps] git_commit HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"git commit failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[GitOps] git_commit error: {exc}", exc_info=True)
            return self.fail_response(f"Error committing changes: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  git_push                                                             #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "git_push",
                "description": (
                    "Push committed changes from the sandbox to the remote repository. "
                    "For HTTPS remotes with authentication, provide username and password (PAT)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the git repository inside the sandbox.",
                            "default": "/workspace",
                        },
                        "branch": {
                            "type": "string",
                            "description": "Branch to push (defaults to the current branch).",
                        },
                        "username": {
                            "type": "string",
                            "description": "Git username for authenticated HTTPS remotes.",
                        },
                        "password": {
                            "type": "string",
                            "description": "Git password or personal access token for HTTPS push.",
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def git_push(
        self,
        path: str = "/workspace",
        branch: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> ToolResult:
        """Push commits to the remote."""
        try:
            await self._ensure_sandbox()

            payload: dict = {"path": path}
            if branch:
                payload["branch"] = branch
            if username:
                payload["username"] = username
            if password:
                payload["password"] = password

            result = await _git_request("POST", self.sandbox_id, "push", payload, timeout=90.0)

            return self.success_response(
                {
                    "message": "Changes pushed to remote",
                    "path": path,
                    **({"branch": branch} if branch else {}),
                    **({k: v for k, v in result.items()} if result else {}),
                }
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[GitOps] git_push HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"git push failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[GitOps] git_push error: {exc}", exc_info=True)
            return self.fail_response(f"Error pushing changes: {str(exc)}")

    # ------------------------------------------------------------------ #
    #  git_branches                                                         #
    # ------------------------------------------------------------------ #

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "git_branches",
                "description": (
                    "List branches in the sandbox git repository. "
                    "Shows all local branches and the current checked-out branch."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the git repository inside the sandbox.",
                            "default": "/workspace",
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
        }
    )
    async def git_branches(self, path: str = "/workspace") -> ToolResult:
        """List branches in the sandbox git repo."""
        try:
            await self._ensure_sandbox()

            result = await _git_request("GET", self.sandbox_id, "branches", {"path": path})

            branches = result.get("branches") or result.get("items") or result or []
            current = result.get("current") or result.get("currentBranch") or None

            return self.success_response(
                {
                    "branches": branches,
                    "current_branch": current,
                    "path": path,
                }
            )

        except httpx.HTTPStatusError as exc:
            logger.error(f"[GitOps] git_branches HTTP error: {exc}", exc_info=True)
            return self.fail_response(
                f"git branches failed (HTTP {exc.response.status_code}): {exc.response.text}"
            )
        except Exception as exc:
            logger.error(f"[GitOps] git_branches error: {exc}", exc_info=True)
            return self.fail_response(f"Error listing branches: {str(exc)}")
