import base64
import asyncio
from typing import Optional
from core.utils.logger import logger
from core.sandbox.sandbox import get_or_start_sandbox


class DaytonaFileService:
    """File operations via Daytona SDK exec.

    The Daytona toolbox HTTP proxy (port 4000) can't resolve container IPs,
    so all file operations use sandbox.process.exec() instead.
    This is reliable and works with all sandbox images.
    """

    def __init__(self, max_retries: int = 3, timeout: int = 60):
        self.max_retries = max_retries
        self.timeout = timeout

    async def _get_sandbox(self, sandbox_id: str):
        """Get a started sandbox instance."""
        return await get_or_start_sandbox(sandbox_id)

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> bool:
        """Write a single file to the sandbox via exec. Returns True on success."""
        for attempt in range(self.max_retries):
            try:
                sandbox = await self._get_sandbox(sandbox_id)

                # Ensure parent directory exists
                parent_dir = "/".join(path.rsplit("/", 1)[:-1]) or "/"
                await sandbox.process.exec(f"mkdir -p '{parent_dir}'", timeout=10)

                # Write file via base64 to handle binary content safely
                b64_content = base64.b64encode(content).decode("ascii")

                # Split into chunks for very large files (shell arg limit ~128KB)
                chunk_size = 65000
                if len(b64_content) <= chunk_size:
                    await sandbox.process.exec(
                        f"echo '{b64_content}' | base64 -d > '{path}'",
                        timeout=self.timeout,
                    )
                else:
                    # Write in chunks for large files
                    await sandbox.process.exec(f"> '{path}'", timeout=10)
                    for i in range(0, len(b64_content), chunk_size):
                        chunk = b64_content[i:i + chunk_size]
                        await sandbox.process.exec(
                            f"echo '{chunk}' | base64 -d >> '{path}'",
                            timeout=self.timeout,
                        )

                # Verify
                verify = await sandbox.process.exec(f"test -f '{path}' && echo OK", timeout=10)
                if "OK" in (verify.result or ""):
                    return True

                logger.warning(f"[DaytonaFileService] write_file verify failed for {path}")
            except Exception as e:
                logger.warning(f"[DaytonaFileService] write_file attempt {attempt+1} error: {e}")

            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)

        logger.error(f"[DaytonaFileService] write_file failed after {self.max_retries} retries: {path}")
        return False

    async def write_files(self, sandbox_id: str, files: list[tuple[str, bytes]]) -> bool:
        """Write multiple files to the sandbox. Returns True if all succeed."""
        success = True
        for path, content in files:
            if not await self.write_file(sandbox_id, path, content):
                success = False
        return success

    async def read_file(self, sandbox_id: str, path: str) -> Optional[bytes]:
        """Read a file from the sandbox via exec. Returns None on failure."""
        try:
            sandbox = await self._get_sandbox(sandbox_id)
            result = await sandbox.process.exec(
                f"base64 '{path}'",
                timeout=self.timeout,
            )
            if result.result:
                return base64.b64decode(result.result.strip())
            return None
        except Exception as e:
            logger.warning(f"[DaytonaFileService] read_file error: {e}")
            return None

    async def create_folder(self, sandbox_id: str, path: str) -> bool:
        """Create a folder in the sandbox."""
        try:
            sandbox = await self._get_sandbox(sandbox_id)
            await sandbox.process.exec(f"mkdir -p '{path}'", timeout=10)
            return True
        except Exception as e:
            logger.warning(f"[DaytonaFileService] create_folder error: {e}")
            return False


_file_service: Optional[DaytonaFileService] = None

def get_file_service() -> DaytonaFileService:
    global _file_service
    if _file_service is None:
        _file_service = DaytonaFileService()
    return _file_service
