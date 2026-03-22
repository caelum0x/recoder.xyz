import httpx
import io
import os
import asyncio
from typing import Optional
from core.utils.logger import logger
from core.utils.config import config


class DaytonaFileService:
    """Direct HTTP integration with Daytona toolbox API.
    Bypasses the broken SDK upload_file() method.
    Uses bracket notation and explicit auth header."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        proxy_url: str = "http://localhost:4000",
        max_retries: int = 3,
        timeout: int = 30,
    ):
        self.api_key = api_key or config.DAYTONA_API_KEY
        self.proxy_url = proxy_url.rstrip("/")
        self.max_retries = max_retries
        self.timeout = timeout

    def _toolbox_url(self, sandbox_id: str, path: str) -> str:
        return f"{self.proxy_url}/toolbox/{sandbox_id}/{path.lstrip('/')}"

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def write_file(self, sandbox_id: str, path: str, content: bytes) -> bool:
        """Write a single file to the sandbox. Returns True on success."""
        return await self.write_files(sandbox_id, [(path, content)])

    async def write_files(self, sandbox_id: str, files: list[tuple[str, bytes]]) -> bool:
        """Write multiple files to the sandbox in a single batch. Returns True on success."""
        url = self._toolbox_url(sandbox_id, "files/bulk-upload")

        for attempt in range(self.max_retries):
            try:
                data_fields = {}
                file_fields = {}
                for i, (path, content) in enumerate(files):
                    data_fields[f"files[{i}][path]"] = path
                    fname = os.path.basename(path) or "file"
                    file_fields[f"files[{i}][file]"] = (fname, io.BytesIO(content))

                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        url,
                        data=data_fields,
                        files=file_fields,
                        headers=self._auth_headers(),
                    )
                    if response.status_code == 200:
                        return True
                    logger.warning(
                        f"[DaytonaFileService] write_files attempt {attempt+1} failed: "
                        f"{response.status_code} {response.text[:200]}"
                    )
            except Exception as e:
                logger.warning(f"[DaytonaFileService] write_files attempt {attempt+1} error: {e}")

            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)

        logger.error(f"[DaytonaFileService] write_files failed after {self.max_retries} retries")
        return False

    async def read_file(self, sandbox_id: str, path: str) -> Optional[bytes]:
        """Read a file from the sandbox. Returns None on failure."""
        url = self._toolbox_url(sandbox_id, f"files?path={path}")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=self._auth_headers())
                if response.status_code == 200:
                    return response.content
                logger.warning(f"[DaytonaFileService] read_file failed: {response.status_code}")
                return None
        except Exception as e:
            logger.warning(f"[DaytonaFileService] read_file error: {e}")
            return None

    async def create_folder(self, sandbox_id: str, path: str) -> bool:
        """Create a folder in the sandbox."""
        url = self._toolbox_url(sandbox_id, "files/folder")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json={"path": path, "mode": "755"},
                    headers=self._auth_headers(),
                )
                return response.status_code in (200, 201)
        except Exception as e:
            logger.warning(f"[DaytonaFileService] create_folder error: {e}")
            return False


_file_service: Optional[DaytonaFileService] = None

def get_file_service() -> DaytonaFileService:
    global _file_service
    if _file_service is None:
        _file_service = DaytonaFileService()
    return _file_service
