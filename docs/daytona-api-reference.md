# Daytona Self-Hosted API Reference

> **Important:** For the self-hosted runner used on Hetzner, sandbox disk limits
> require Docker `overlay2` on XFS with `pquota`/`prjquota` enabled. See
> [`docs/daytona-xfs-pquota-runbook.md`](./daytona-xfs-pquota-runbook.md) before
> debugging sandbox creation failures.

## Connection
- **URL**: `http://localhost:3900/api`
- **API Key**: `dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946`
- **Target/Region**: `us` 
- **Dashboard**: `http://77.42.23.19:3900` (login: dev@daytona.io / password)

## Python SDK Usage

```python
from daytona_sdk import AsyncDaytona, DaytonaConfig, CreateSandboxFromSnapshotParams

config = DaytonaConfig(
    api_key="dyt_8532...",
    api_url="http://localhost:3900/api",
    target="us"
)
daytona = AsyncDaytona(config)

# Create sandbox
sandbox = await daytona.create(CreateSandboxFromSnapshotParams(
    snapshot="daytonaio/sandbox:0.5.0",  # Full image with git, build tools
    public=True,
    env_vars={"MY_VAR": "value"},
    auto_stop_interval=60,
    auto_archive_interval=120,
))
```

## Sandbox Lifecycle
- `daytona.create(params)` — Create new sandbox
- `daytona.get(sandbox_id)` — Get sandbox by ID
- `daytona.list()` — List all sandboxes
- `daytona.start(sandbox)` — Start stopped sandbox
- `daytona.stop(sandbox)` — Stop running sandbox
- `daytona.delete(sandbox)` — Delete sandbox
- `sandbox.resize(cpu, memory, disk)` — Resize resources
- `sandbox.set_autostop_interval(minutes)` — Configure auto-stop
- `sandbox.set_labels({"key": "value"})` — Tag sandbox

## FileSystem (sandbox.fs)
```python
# Read file
content = await sandbox.fs.read("/path/to/file")

# Write file
await sandbox.fs.write("/path/to/file", content)

# Seek, truncate, readline — standard file I/O
```

## Git (sandbox.git)
```python
await sandbox.git.clone("https://github.com/user/repo.git", "/workspace/repo")
await sandbox.git.add("/workspace/repo", ["file1.py", "file2.py"])
await sandbox.git.commit("/workspace/repo", "feat: add feature")
await sandbox.git.push("/workspace/repo")
await sandbox.git.pull("/workspace/repo")

# Branch operations
branches = await sandbox.git.branches("/workspace/repo")
await sandbox.git.create_branch("/workspace/repo", "feature-branch")
await sandbox.git.checkout_branch("/workspace/repo", "feature-branch")
await sandbox.git.delete_branch("/workspace/repo", "old-branch")
status = await sandbox.git.status("/workspace/repo")
```

## Process Execution (sandbox.process)
```python
# Simple command execution
result = await sandbox.process.exec("ls -la /workspace")

# Code execution (Python/JS/TS)
result = await sandbox.process.code_run("print('hello')", language="python")

# Sessions (persistent processes)
session_id = await sandbox.process.create_session("my-session")
await sandbox.process.execute_session_command(session_id, command)
logs = await sandbox.process.get_session_command_logs(session_id, command_id)

# PTY (terminal emulation)
pty = await sandbox.process.create_pty_session(session_id)
await sandbox.process.connect_pty_session(session_id)
await sandbox.process.resize_pty_session(session_id, cols=120, rows=40)
```

## LSP — Language Server Protocol (sandbox.create_lsp_server)
```python
# Start LSP server for a language
lsp = await sandbox.create_lsp_server(language="python", path="/workspace")
await lsp.start()

# Get completions at cursor position
completions = await lsp.completions("/workspace/main.py", line=10, character=5)

# Get document symbols (functions, classes, variables)
symbols = await lsp.document_symbols("/workspace/main.py")

# Search workspace symbols
results = await lsp.workspace_symbols("MyClass")

# Get all symbols in sandbox
all_symbols = await lsp.sandbox_symbols()

# File lifecycle
await lsp.did_open("/workspace/main.py")
await lsp.did_close("/workspace/main.py")
await lsp.stop()
```

## Code Interpreter (sandbox.code_interpreter)
```python
# Create execution context
ctx = await sandbox.code_interpreter.create_context(language="python")

# Run code in context (stateful — variables persist)
result = await sandbox.code_interpreter.run_code(ctx.id, "x = 42\nprint(x)")

# List contexts
contexts = await sandbox.code_interpreter.list_contexts()

# Delete context
await sandbox.code_interpreter.delete_context(ctx.id)
```

## Computer Use (sandbox.computer_use)
```python
# Start VNC/browser session
await sandbox.computer_use.start()

# Get status
status = await sandbox.computer_use.get_status()

# Stop
await sandbox.computer_use.stop()
```

## Preview URLs
```python
# Get preview link for a port
link = await sandbox.get_preview_link(port=3000)

# Create signed preview URL (time-limited)
signed = await sandbox.create_signed_preview_url(port=3000, expires_in=3600)
```

## SSH Access
```python
# Create SSH access
ssh = await sandbox.create_ssh_access()

# Revoke
await sandbox.revoke_ssh_access()
```

## Volumes (persistent storage)
```python
from daytona_sdk import AsyncDaytona

# Create volume
volume = await daytona.volumes.create(name="my-data", size_gb=10)

# List volumes
volumes = await daytona.volumes.list()

# Attach to sandbox (via env_vars or labels)
```

## REST API Endpoints (for non-SDK usage)
- `GET /api/sandbox` — List sandboxes
- `POST /api/sandbox` — Create sandbox
- `GET /api/sandbox/:id` — Get sandbox
- `DELETE /api/sandbox/:id` — Delete sandbox
- `GET /api/snapshots` — List snapshots
- `POST /api/snapshots` — Create snapshot
- `GET /api/runners` — List runners
- `GET /api/api-keys` — List API keys
- `POST /api/api-keys` — Create API key

## Current Config
- Snapshot: `daytonaio/sandbox:0.5.0-slim` (lightweight, git/curl/wget auto-installed on creation)
- Auto-stop: 60 minutes
- Auto-archive: 120 minutes
- Preview URLs: `https://{port}-{sandboxId}.sandbox.recoder.xyz` (SSL via Cloudflare Origin Cert)
- DNS: `*.sandbox.recoder.xyz` → `77.42.23.19` (DNS only, not proxied)
- Org quotas: 4 CPU, 8GB mem, 50GB disk per sandbox
- Runner: `default` (state=ready, region=us)
