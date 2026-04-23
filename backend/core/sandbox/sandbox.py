from daytona_sdk import AsyncDaytona, DaytonaConfig, CreateSandboxFromSnapshotParams, AsyncSandbox, SessionExecuteRequest, Resources, SandboxState
from dotenv import load_dotenv
from core.utils.logger import logger
from core.utils.config import config
from core.utils.config import Configuration
import asyncio

load_dotenv()

# logger.debug("Initializing Daytona sandbox configuration")
daytona_config = DaytonaConfig(
    api_key=config.DAYTONA_API_KEY,
    api_url=config.DAYTONA_SERVER_URL, 
    target=config.DAYTONA_TARGET,
)

if daytona_config.api_key:
    logger.debug("Daytona sandbox configured successfully")
else:
    logger.warning("No Daytona API key found in environment variables")

if daytona_config.api_url:
    logger.debug(f"Daytona API URL set to: {daytona_config.api_url}")
else:
    logger.warning("No Daytona API URL found in environment variables")

if daytona_config.target:
    logger.debug(f"Daytona target set to: {daytona_config.target}")
else:
    logger.warning("No Daytona target found in environment variables")

try:
    daytona = AsyncDaytona(daytona_config)
    logger.info("Daytona client initialized successfully")
except Exception as e:
    logger.warning(f"Daytona client initialization failed (sandbox features disabled): {e}")
    daytona = None  # type: ignore

async def _ensure_workspace(sandbox: AsyncSandbox):
    """Ensure /workspace is a symlink to /home/daytona.

    Daytona sandbox images have no /workspace directory. The sandbox user home
    is /home/daytona and the SDK resolves relative paths there. However, all
    tools use absolute /workspace/... paths. A symlink bridges the two so that
    /workspace/presentations/... maps to /home/daytona/presentations/... and
    the file server on :8080 (serving /home/daytona/) can serve them.
    """
    try:
        check = await sandbox.process.exec(
            "readlink /workspace 2>/dev/null || (test -d /workspace && echo REAL_DIR) || echo MISSING",
            timeout=5,
        )
        result = (check.result or "").strip()

        if result == "/home/daytona":
            return  # Already correct symlink

        if result == "REAL_DIR":
            # Real directory exists — replace with symlink (move contents first)
            await sandbox.process.exec(
                "sudo cp -a /workspace/. /home/daytona/ 2>/dev/null; "
                "sudo rm -rf /workspace && sudo ln -sfn /home/daytona /workspace",
                timeout=15,
            )
            logger.info("Replaced /workspace directory with symlink -> /home/daytona")
        elif result == "MISSING":
            await sandbox.process.exec("sudo ln -sfn /home/daytona /workspace", timeout=10)
            logger.info("Created /workspace -> /home/daytona symlink")
        else:
            # Some other symlink target — fix it
            await sandbox.process.exec(
                "sudo rm -f /workspace && sudo ln -sfn /home/daytona /workspace",
                timeout=10,
            )
            logger.info(f"Fixed /workspace symlink (was -> {result})")
    except Exception as e:
        logger.warning(f"Could not ensure /workspace: {e}")


def _is_daytona_session_enospc(error: Exception) -> bool:
    error_text = f"{type(error).__name__}: {error}".lower()
    return (
        ".daytona/sessions" in error_text
        and "no space left on device" in error_text
    )


def _is_daytona_session_conflict(error: Exception) -> bool:
    error_text = f"{type(error).__name__}: {error}".lower()
    return "session already exists" in error_text or "conflict:" in error_text


async def cleanup_daytona_session_dirs(
    sandbox: AsyncSandbox,
    older_than_minutes: int | None = 10,
) -> None:
    """Best-effort cleanup for leaked Daytona session directories inside a sandbox."""
    session_root = "/home/daytona/.daytona/sessions"
    if older_than_minutes is None:
        cleanup_cmd = (
            f"mkdir -p {session_root} && "
            f"find {session_root} -mindepth 1 -maxdepth 1 -type d "
            "-print -exec rm -rf {} + 2>/dev/null || true"
        )
        cleanup_scope = "all"
    else:
        cleanup_cmd = (
            f"mkdir -p {session_root} && "
            f"find {session_root} -mindepth 1 -maxdepth 1 -type d -mmin +{older_than_minutes} "
            "-print -exec rm -rf {} + 2>/dev/null || true"
        )
        cleanup_scope = f"older than {older_than_minutes}m"
    try:
        result = await sandbox.process.exec(cleanup_cmd, timeout=20)
        cleaned = (result.result or "").strip()
        if cleaned:
            logger.warning(
                f"Cleaned Daytona session dirs ({cleanup_scope}): {cleaned}"
            )
    except Exception as cleanup_err:
        logger.warning(f"Failed to cleanup Daytona session dirs: {cleanup_err}")


async def create_session_with_recovery(sandbox: AsyncSandbox, session_id: str) -> None:
    """Create a Daytona process session, cleaning leaked session dirs and retrying on ENOSPC."""
    try:
        await sandbox.process.create_session(session_id)
        return
    except Exception as first_err:
        if _is_daytona_session_conflict(first_err):
            logger.warning(f"Session {session_id} already exists; treating create as successful")
            return
        if not _is_daytona_session_enospc(first_err):
            raise

        logger.warning(
            f"Session create hit ENOSPC for {session_id}; cleaning stale Daytona session dirs and retrying"
        )
        await cleanup_daytona_session_dirs(sandbox, older_than_minutes=10)

        try:
            await sandbox.process.create_session(session_id)
            return
        except Exception as second_err:
            if _is_daytona_session_conflict(second_err):
                logger.warning(
                    f"Session {session_id} reported conflict after ENOSPC cleanup; treating create as successful"
                )
                return
            if not _is_daytona_session_enospc(second_err):
                raise

            logger.warning(
                f"Session create still ENOSPC for {session_id}; retrying after aggressive Daytona session cleanup"
            )
            await cleanup_daytona_session_dirs(sandbox, older_than_minutes=None)
            try:
                await sandbox.process.create_session(session_id)
            except Exception as third_err:
                if _is_daytona_session_conflict(third_err):
                    logger.warning(
                        f"Session {session_id} reported conflict after aggressive cleanup; treating create as successful"
                    )
                    return
                raise


async def execute_session_command_with_recovery(
    sandbox: AsyncSandbox,
    session_id: str,
    req: SessionExecuteRequest,
    timeout: int | None = None,
    recreate_session: bool = False,
):
    """Execute a Daytona session command, cleaning leaked session dirs and retrying on ENOSPC."""
    try:
        return await sandbox.process.execute_session_command(
            session_id=session_id,
            req=req,
            timeout=timeout,
        )
    except Exception as first_err:
        if not _is_daytona_session_enospc(first_err):
            raise

        logger.warning(
            f"Session exec hit ENOSPC for {session_id}; cleaning stale Daytona session dirs and retrying"
        )
        await cleanup_daytona_session_dirs(sandbox, older_than_minutes=10)

        try:
            return await sandbox.process.execute_session_command(
                session_id=session_id,
                req=req,
                timeout=timeout,
            )
        except Exception as second_err:
            if not _is_daytona_session_enospc(second_err):
                raise

            logger.warning(
                f"Session exec still ENOSPC for {session_id}; retrying after aggressive Daytona session cleanup"
            )
            await cleanup_daytona_session_dirs(sandbox, older_than_minutes=None)

            if recreate_session:
                try:
                    await sandbox.process.delete_session(session_id)
                except Exception as delete_err:
                    logger.debug(f"Failed deleting session {session_id} before recreate: {delete_err}")
                await create_session_with_recovery(sandbox, session_id)

            return await sandbox.process.execute_session_command(
                session_id=session_id,
                req=req,
                timeout=timeout,
            )


async def get_or_start_sandbox(sandbox_id: str) -> AsyncSandbox:
    """Retrieve a sandbox by ID, check its state, and start it if needed."""

    logger.info(f"Getting or starting sandbox with ID: {sandbox_id}")

    try:
        sandbox = await daytona.get(sandbox_id)

        # Treat any non-STARTED state as needing recovery/startup. In practice we
        # have seen sandboxes in "error" state be reported as "ready", which then
        # causes downstream file/terminal operations to fail with "No such container".
        if sandbox.state != SandboxState.STARTED:
            logger.info(f"Sandbox is in {sandbox.state} state. Starting...")
            try:
                await daytona.start(sandbox)

                # Wait for sandbox to reach STARTED state
                for _ in range(30):
                    await asyncio.sleep(1)
                    sandbox = await daytona.get(sandbox_id)
                    if sandbox.state == SandboxState.STARTED:
                        break

                if sandbox.state != SandboxState.STARTED:
                    raise RuntimeError(
                        f"Sandbox {sandbox_id} failed to reach STARTED state (current: {sandbox.state})"
                    )

                # Ensure /workspace symlink, start file server and computer use
                await _ensure_workspace(sandbox)
                await start_file_server(sandbox)
                await start_computer_use_safe(sandbox)
            except Exception as e:
                logger.error(f"Error starting sandbox: {e}")
                raise e
        else:
            # Sandbox already running — still ensure /workspace exists
            await _ensure_workspace(sandbox)

        logger.info(f"Sandbox {sandbox_id} is ready")
        return sandbox

    except Exception as e:
        logger.error(f"Error retrieving or starting sandbox: {str(e)}")
        raise e

async def start_file_server(sandbox: AsyncSandbox):
    """Start a simple HTTP file server on port 8080 in the sandbox.

    Uses python3 http.server since the slim Daytona image doesn't have supervisord.
    The server serves files from /home/daytona/ making them accessible via
    https://8080-{sandboxId}.sandbox.recoder.xyz/
    """
    session_id = "file-server"
    try:
        # Try to create session (may already exist)
        try:
            await create_session_with_recovery(sandbox, session_id)
        except Exception:
            pass  # Session may already exist from a previous start

        # Check if port 8080 is already in use (ss may not exist in slim images)
        check = await sandbox.process.exec(
            "curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://localhost:8080/ 2>/dev/null || echo '000'",
            timeout=5
        )
        if check.result and check.result.strip() not in ('', '000'):
            logger.info("File server already running on port 8080")
            return

        # Start python3 HTTP server directly via exec (more reliable than sessions)
        await sandbox.process.exec(
            "cd /home/daytona && nohup python3 -m http.server 8080 --bind 0.0.0.0 > /tmp/fileserver.log 2>&1 &",
            timeout=5
        )
        # Verify it started
        import asyncio
        await asyncio.sleep(1)
        verify = await sandbox.process.exec(
            "curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8080/ 2>/dev/null || echo '000'",
            timeout=5
        )
        if verify.result and verify.result.strip() not in ('', '000'):
            logger.info("File server started and verified on port 8080")
        else:
            logger.warning(f"File server may not have started: verify={verify.result}")
    except Exception as e:
        # Don't fail sandbox creation if file server fails
        logger.warning(f"Could not start file server: {str(e)}")

MAX_CONCURRENT_SANDBOXES = 4  # Hard limit — 15GB server can't handle more

async def _evict_oldest_sandbox():
    """Stop the oldest sandbox if we're at the concurrency limit."""
    try:
        page = await daytona.list(limit=200)
        sandboxes = getattr(page, "items", []) or []
        started = []
        for sandbox in sandboxes:
            state = getattr(getattr(sandbox, "state", None), "value", getattr(sandbox, "state", None))
            if str(state).lower() == "started":
                started.append(sandbox)
        if len(started) >= MAX_CONCURRENT_SANDBOXES:
            def sort_key(sandbox):
                return (
                    getattr(sandbox, "updated_at", None)
                    or getattr(sandbox, "updatedAt", None)
                    or getattr(sandbox, "created_at", None)
                    or getattr(sandbox, "createdAt", None)
                    or ""
                )

            oldest = min(started, key=sort_key)
            logger.info(f"Evicting oldest sandbox {oldest.id} to stay within {MAX_CONCURRENT_SANDBOXES} limit")
            await daytona.stop(oldest)
    except Exception as e:
        logger.warning(f"Sandbox eviction check failed (non-fatal): {e}")

async def create_sandbox(password: str, project_id: str = None) -> AsyncSandbox:
    """Create a new sandbox with all required services configured and running."""

    await _evict_oldest_sandbox()
    logger.info("Creating new Daytona sandbox environment")
    # logger.debug("Configuring sandbox with snapshot and environment variables")
    
    labels = None
    if project_id:
        # logger.debug(f"Using sandbox_id as label: {project_id}")
        labels = {'id': project_id}
        
    params = CreateSandboxFromSnapshotParams(
        snapshot=Configuration.SANDBOX_SNAPSHOT_NAME,
        public=True,
        labels=labels,
        env_vars={
            "CHROME_PERSISTENT_SESSION": "true",
            "RESOLUTION": "1048x768x24",
            "RESOLUTION_WIDTH": "1048",
            "RESOLUTION_HEIGHT": "768",
            "VNC_PASSWORD": password,
            "ANONYMIZED_TELEMETRY": "false",
            "CHROME_PATH": "",
            "CHROME_USER_DATA": "",
            "CHROME_DEBUGGING_PORT": "9222",
            "CHROME_DEBUGGING_HOST": "localhost",
            "CHROME_CDP": ""
        },
        auto_stop_interval=1800,    # 30 min — aggressive to stay within 15GB RAM (server runs 40+ containers)
        auto_archive_interval=3600,  # 1 hour after stop
    )
    
    # Create the sandbox
    sandbox = await daytona.create(params)
    logger.info(f"Sandbox created with ID: {sandbox.id}")

    # Ensure /workspace exists (tools write here, but it doesn't exist in Daytona images)
    await _ensure_workspace(sandbox)

    # Start the lightweight file server synchronously so callers get a usable
    # workspace immediately. Defer the heavy package/tool warm-up work so
    # sandbox resolution for real agent runs does not sit behind apt/pip/npm.
    await start_file_server(sandbox)

    asyncio.create_task(_finish_sandbox_setup(sandbox))

    logger.info("Sandbox environment ready for immediate use; continuing heavy setup in background")
    return sandbox


async def _finish_sandbox_setup(sandbox: AsyncSandbox):
    """Run non-critical sandbox warm-up steps in background."""

    # Install essential system tools (git, curl, wget, imagemagick, ffmpeg)
    try:
        result = await sandbox.process.exec(
            "which git && which ffmpeg && which convert && echo ALL_PRESENT || ("
            "sudo rm -f /etc/apt/sources.list.d/yarn.list 2>/dev/null; "
            "sudo apt-get update -qq 2>/dev/null && "
            "sudo apt-get install -y -qq git curl wget imagemagick ffmpeg > /dev/null 2>&1 && "
            "echo 'tools installed')",
            timeout=180,
        )
        logger.info(f"Sandbox tools setup: {result.result.strip()[:80]}")
    except Exception as e:
        logger.warning(f"Could not install tools in sandbox: {e}")

    # Install Python packages required by tools (openpyxl for spreadsheets,
    # python-pptx for presentation export, python-docx for documents)
    try:
        check = await sandbox.process.exec(
            "python3 -c 'import openpyxl, pptx, docx' 2>&1 && echo ALL_OK || echo MISSING",
            timeout=10,
        )
        if "MISSING" in (check.result or ""):
            result = await sandbox.process.exec(
                "pip3 install openpyxl python-pptx python-docx 2>&1 | tail -1",
                timeout=90,
            )
            logger.info(f"Installed Python packages in sandbox: {(result.result or '').strip()[-80:]}")
    except Exception as e:
        logger.warning(f"Could not install Python packages in sandbox: {e}")

    # Pre-warm npm cache with common packages (speeds up first npm install from 10min to ~2min)
    try:
        await sandbox.process.exec(
            "mkdir -p /tmp/npm-warm && cd /tmp/npm-warm && "
            "npm init -y > /dev/null 2>&1 && "
            "npm install --prefer-offline --no-audit --no-fund "
            "react@18 react-dom@18 vite@5 @vitejs/plugin-react@4 "
            "tailwindcss@3 postcss@8 autoprefixer@10 > /dev/null 2>&1; "
            "rm -rf /tmp/npm-warm && echo 'npm cache warmed'",
            timeout=300,
        )
        logger.info("Sandbox npm cache pre-warmed with React/Vite/Tailwind")
    except Exception as e:
        logger.warning(f"Could not pre-warm npm cache: {e}")

    await start_computer_use_safe(sandbox)

    logger.info(f"Sandbox background setup completed for {sandbox.id}")


async def start_computer_use_safe(sandbox: AsyncSandbox):
    """Start VNC for computer use in the sandbox.

    Tries SDK method first, then falls back to manual Xvfb + x11vnc + websockify.
    Non-blocking — fails silently if VNC tools aren't available.
    """
    # Try SDK method first (requires full image with xvfb/xfce4/x11vnc/novnc)
    try:
        await sandbox.computer_use.start()
        logger.info(f"Computer use started via SDK in sandbox {sandbox.id}")
        return
    except Exception as e:
        logger.info(f"SDK computer_use.start() not available in sandbox {sandbox.id}: {e}")

    # Fallback: manual VNC startup (full image has Xvfb + x11vnc)
    try:
        # Check if Xvfb is available
        check = await sandbox.process.exec("which Xvfb", timeout=5)
        if not check.result or 'Xvfb' not in (check.result or ''):
            logger.info(f"No VNC tools in sandbox {sandbox.id} (slim image)")
            return

        # Start Xvfb display
        await sandbox.process.exec(
            "Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset &",
            timeout=5
        )
        await asyncio.sleep(1)

        # Start x11vnc
        await sandbox.process.exec(
            "DISPLAY=:99 x11vnc -display :99 -forever -shared -rfbport 5900 -nopw -bg -o /tmp/x11vnc.log",
            timeout=10
        )
        await asyncio.sleep(1)

        # Start websockify (noVNC proxy) on port 6080
        await sandbox.process.exec(
            "which websockify || pip3 install -q websockify 2>/dev/null",
            timeout=30
        )
        await sandbox.process.exec(
            "nohup websockify 6080 localhost:5900 --web /usr/share/novnc > /tmp/websockify.log 2>&1 &",
            timeout=5
        )

        # Export DISPLAY for child processes
        await sandbox.process.exec("echo 'export DISPLAY=:99' >> ~/.bashrc", timeout=5)

        logger.info(f"VNC started manually in sandbox {sandbox.id} (Xvfb+x11vnc+websockify)")
    except Exception as e:
        logger.warning(f"Could not start VNC in sandbox {sandbox.id}: {e}")

async def delete_sandbox(sandbox_id: str) -> bool:
    """Delete a sandbox by its ID."""
    logger.info(f"Deleting sandbox with ID: {sandbox_id}")

    try:
        # Get the sandbox
        sandbox = await daytona.get(sandbox_id)
        
        # Delete the sandbox
        await daytona.delete(sandbox)
        
        logger.info(f"Successfully deleted sandbox {sandbox_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting sandbox {sandbox_id}: {str(e)}")
        raise e


# ── Volume Management ─────────────────────────────────────────────

async def create_volume(name: str, size_gb: int = 10) -> dict:
    """Create a persistent volume for agent workspaces."""
    try:
        volume = await daytona.volumes.create(name=name, size_gb=size_gb)
        logger.info(f"Volume created: {name} ({size_gb}GB)")
        return {"name": name, "size_gb": size_gb, "id": getattr(volume, 'id', name)}
    except Exception as e:
        logger.error(f"Error creating volume {name}: {e}")
        raise


async def list_volumes() -> list:
    """List all persistent volumes."""
    try:
        volumes = await daytona.volumes.list()
        return [{"name": getattr(v, 'name', ''), "id": getattr(v, 'id', '')} for v in volumes]
    except Exception as e:
        logger.warning(f"Error listing volumes: {e}")
        return []


# ── Preview URLs ──────────────────────────────────────────────────

def get_preview_url(sandbox_id: str, port: int = 3000) -> str:
    """Generate a preview URL for a sandbox port.
    Format: https://{port}-{sandboxId}.sandbox.recoder.xyz
    """
    return f"https://{port}-{sandbox_id}.sandbox.recoder.xyz"


async def get_sandbox_preview_link(sandbox: AsyncSandbox, port: int = 3000) -> str:
    """Get preview link from sandbox object (uses SDK if available, falls back to URL pattern)."""
    try:
        link = await sandbox.get_preview_link(port=port)
        return link
    except Exception:
        return get_preview_url(sandbox.id, port)


# ── Computer Use ──────────────────────────────────────────────────

async def start_computer_use(sandbox: AsyncSandbox) -> dict:
    """Start VNC/browser session in sandbox for computer use."""
    try:
        await sandbox.computer_use.start()
        status = await sandbox.computer_use.get_status()
        logger.info(f"Computer use started in sandbox {sandbox.id}")
        return {"status": "started", "details": str(status)}
    except Exception as e:
        logger.error(f"Error starting computer use: {e}")
        raise


async def stop_computer_use(sandbox: AsyncSandbox) -> None:
    """Stop VNC/browser session."""
    try:
        await sandbox.computer_use.stop()
        logger.info(f"Computer use stopped in sandbox {sandbox.id}")
    except Exception as e:
        logger.warning(f"Error stopping computer use: {e}")
