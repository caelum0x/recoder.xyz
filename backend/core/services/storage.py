"""
S3-compatible storage client.

Supports AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, and any
S3-compatible provider.  All file upload/download/signed-URL operations
go through this module.

Environment variables:
    S3_ENDPOINT_URL      – Custom endpoint (required for R2/MinIO)
    S3_ACCESS_KEY_ID     – Access key
    S3_SECRET_ACCESS_KEY – Secret key
    S3_REGION            – Region (default: "auto")
    S3_BUCKET_PREFIX     – Optional prefix prepended to bucket names
    S3_PUBLIC_URL        – Public URL base for get_public_url()
"""

import asyncio
from typing import Optional

from core.utils.logger import logger
from core.utils.config import config

_storage_client = None
_s3_raw_client = None


class _S3BucketClient:
    """Operations scoped to a single S3 bucket."""

    def __init__(self, s3_client, bucket_name: str, public_base: Optional[str]):
        self._s3 = s3_client
        self._bucket = bucket_name
        self._public_base = public_base

    @staticmethod
    def _key(path: str) -> str:
        return path.lstrip("/")

    async def upload(self, path: str, data: bytes, options: Optional[dict] = None):
        options = options or {}
        content_type = (
            options.get("content-type")
            or options.get("content_type")
            or "application/octet-stream"
        )
        key = self._key(path)

        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return {"success": True, "Key": key}

    async def download(self, path: str) -> bytes:
        response = await asyncio.to_thread(
            self._s3.get_object,
            Bucket=self._bucket,
            Key=self._key(path),
        )
        body = response["Body"]
        return await asyncio.to_thread(body.read)

    async def create_signed_url(self, path: str, expires_in: int):
        url = await asyncio.to_thread(
            self._s3.generate_presigned_url,
            "get_object",
            Params={"Bucket": self._bucket, "Key": self._key(path)},
            ExpiresIn=expires_in,
        )
        return {"signedURL": url}

    async def get_public_url(self, path: str) -> str:
        key = self._key(path)
        if self._public_base:
            base = self._public_base.rstrip("/")
            return f"{base}/{self._bucket}/{key}"
        endpoint = self._s3.meta.endpoint_url
        return f"{endpoint}/{self._bucket}/{key}"

    async def remove(self, paths: list[str]):
        objects = [{"Key": self._key(p)} for p in paths]
        await asyncio.to_thread(
            self._s3.delete_objects,
            Bucket=self._bucket,
            Delete={"Objects": objects, "Quiet": True},
        )
        return {"success": True}

    async def copy(self, source: str, destination: str):
        copy_source = {"Bucket": self._bucket, "Key": self._key(source)}
        await asyncio.to_thread(
            self._s3.copy_object,
            Bucket=self._bucket,
            CopySource=copy_source,
            Key=self._key(destination),
        )
        return {"success": True}


class _S3StorageClient:
    """Top-level storage client — use ``from_(bucket)`` to scope by bucket."""

    def __init__(self, s3_client, bucket_prefix: str = "", public_base: Optional[str] = None):
        self._s3 = s3_client
        self._prefix = bucket_prefix
        self._public_base = public_base

    def from_(self, bucket: str) -> _S3BucketClient:
        actual = f"{self._prefix}{bucket}" if self._prefix else bucket
        return _S3BucketClient(self._s3, actual, self._public_base)


def _build_s3_client():
    """Create a boto3 S3 client from config."""
    import boto3
    from botocore.config import Config as BotoConfig

    endpoint = config.S3_ENDPOINT_URL
    access_key = config.S3_ACCESS_KEY_ID
    secret_key = config.S3_SECRET_ACCESS_KEY
    region = config.S3_REGION or "auto"

    if not access_key or not secret_key:
        raise RuntimeError(
            "S3 storage is not configured.  Set S3_ACCESS_KEY_ID and "
            "S3_SECRET_ACCESS_KEY (and optionally S3_ENDPOINT_URL for "
            "R2/MinIO)."
        )

    kwargs: dict = {
        "service_name": "s3",
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region_name": region,
        "config": BotoConfig(
            retries={"max_attempts": 3, "mode": "standard"},
            max_pool_connections=50,
        ),
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint

    return boto3.client(**kwargs)


async def get_storage_client():
    """
    Return the S3 storage interface (lazy singleton).

    This is the ONLY place in the codebase that should touch
    the raw S3 client.  Every other module imports
    ``get_storage_client()`` from here.
    """
    global _storage_client, _s3_raw_client

    if _storage_client is not None:
        return _storage_client

    _s3_raw_client = _build_s3_client()
    prefix = config.S3_BUCKET_PREFIX or ""
    public_url = config.S3_PUBLIC_URL or None

    _storage_client = _S3StorageClient(_s3_raw_client, prefix, public_url)
    logger.info(
        "S3 storage initialised — endpoint=%s prefix=%s",
        config.S3_ENDPOINT_URL or "(AWS default)",
        prefix or "(none)",
    )
    return _storage_client


async def upload_file(bucket: str, path: str, data: bytes, options: Optional[dict] = None):
    """Upload file bytes to a bucket."""
    storage = await get_storage_client()
    return await storage.from_(bucket).upload(path, data, options or {})


async def download_file(bucket: str, path: str) -> bytes:
    """Download a file from a bucket."""
    storage = await get_storage_client()
    return await storage.from_(bucket).download(path)


async def create_signed_url(bucket: str, path: str, expires_in: int = 86400) -> Optional[str]:
    """Create a time-limited signed URL for private file access."""
    storage = await get_storage_client()
    result = await storage.from_(bucket).create_signed_url(path, expires_in)
    return result.get("signedURL") or result.get("signed_url")


async def get_public_url(bucket: str, path: str) -> str:
    """Get the public (unsigned) URL for a file in a public bucket."""
    storage = await get_storage_client()
    return await storage.from_(bucket).get_public_url(path)


def reset_storage_singleton():
    """Reset singleton (for tests / worker recycling)."""
    global _storage_client, _s3_raw_client
    _storage_client = None
    _s3_raw_client = None
