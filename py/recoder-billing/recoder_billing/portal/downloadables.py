"""Self-serve downloadables portal. Fused from polar/customer_portal/service/downloadables.py,
owned by Recoder.

Polar's ``DownloadableService`` is the customer side of file benefits: when a customer is
granted a file benefit they get a *downloadable*, and the portal mints short-lived signed
URLs they can redeem to fetch the file from object storage. The *owned* spine keeps:

- the grant/revoke lifecycle for a benefit's file (``granted`` ↔ ``revoked``),
- the signed, time-limited download token — fused to a self-contained HMAC-SHA256 token
  (the owned replacement for Polar's ``itsdangerous`` ``URLSafeTimedSerializer``) so no
  third-party signer is required,
- token verification with TTL + tamper checks, and the download-count increment.

Object-storage presigning and durable rows are host concerns behind the
:class:`DownloadableRepository` port and the host-supplied signing secret. The token
mint/verify is real crypto (constant-time MAC compare, expiry enforcement) — not a stub.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Protocol

from ..kit.crypto import constant_time_compare
from ..kit.utils import generate_uuid, utc_now


class DownloadableStatus(StrEnum):
    granted = "granted"
    revoked = "revoked"


@dataclass
class Downloadable:
    """A customer's redeemable access to a benefit's file. Canonical shape + counters."""

    customer_id: uuid.UUID
    benefit_id: uuid.UUID
    file_id: uuid.UUID

    status: DownloadableStatus = DownloadableStatus.granted
    member_id: uuid.UUID | None = None

    downloaded: int = 0
    last_downloaded_at: datetime | None = None

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: datetime = field(default_factory=utc_now)
    modified_at: datetime | None = None

    @property
    def is_granted(self) -> bool:
        return self.status == DownloadableStatus.granted


@dataclass(frozen=True)
class DownloadToken:
    """A minted, signed download token and the moment it expires."""

    token: str
    expires_at: datetime


class DownloadableError(Exception):
    """Base error for downloadable operations."""


class DownloadableNotFound(DownloadableError):
    def __init__(self) -> None:
        super().__init__("Downloadable not found.")


class DownloadTokenInvalid(DownloadableError):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(f"Download token is invalid: {reason}.")


class DownloadTokenExpired(DownloadableError):
    def __init__(self) -> None:
        super().__init__("Download token has expired.")


class DownloadableRepository(Protocol):
    """Durable persistence port for downloadables (satisfied by the host's DB layer)."""

    async def upsert_granted(
        self,
        *,
        customer_id: uuid.UUID,
        benefit_id: uuid.UUID,
        file_id: uuid.UUID,
        member_id: uuid.UUID | None,
    ) -> Downloadable: ...

    async def get(self, downloadable_id: uuid.UUID) -> Downloadable | None: ...

    async def revoke_for_benefit(
        self,
        *,
        customer_id: uuid.UUID,
        benefit_id: uuid.UUID,
        member_id: uuid.UUID | None,
    ) -> int:
        """Revoke the customer's granted rows for a benefit; returns the count revoked."""
        ...

    async def save(self, downloadable: Downloadable) -> Downloadable: ...


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


class DownloadableService:
    """Owned self-serve downloadables portal over the repository port + a signing secret.

    The signing secret is host-supplied at construction (Polar read
    ``S3_FILES_DOWNLOAD_SECRET`` from settings). It is the HMAC key for the download token
    and is never persisted with a downloadable.
    """

    def __init__(self, *, signing_secret: str, ttl_seconds: int = 600) -> None:
        if not signing_secret:
            raise ValueError(
                "A download-token signing secret is required; refusing to sign with "
                "an empty key."
            )
        self._secret = signing_secret.encode("utf-8")
        self._ttl = timedelta(seconds=ttl_seconds)

    async def grant_for_benefit_file(
        self,
        repository: DownloadableRepository,
        *,
        customer_id: uuid.UUID,
        benefit_id: uuid.UUID,
        file_id: uuid.UUID,
        member_id: uuid.UUID | None = None,
    ) -> Downloadable:
        """Grant (or re-grant) a customer access to a benefit's file. Fused from Polar."""
        return await repository.upsert_granted(
            customer_id=customer_id,
            benefit_id=benefit_id,
            file_id=file_id,
            member_id=member_id,
        )

    async def revoke_for_benefit(
        self,
        repository: DownloadableRepository,
        *,
        customer_id: uuid.UUID,
        benefit_id: uuid.UUID,
        member_id: uuid.UUID | None = None,
    ) -> int:
        """Revoke the customer's downloadables for a benefit. Fused from Polar's scoped revoke.

        A member-level revoke (``member_id`` set) only revokes that member's rows; a
        customer-level revoke only the shared ones — the exact scoping Polar enforced.
        """
        return await repository.revoke_for_benefit(
            customer_id=customer_id,
            benefit_id=benefit_id,
            member_id=member_id,
        )

    def create_download_token(self, downloadable: Downloadable) -> DownloadToken:
        """Mint a short-lived signed token for a downloadable. Owned HMAC replacement.

        Fuses Polar's ``create_download_token``: the payload carries the downloadable id,
        its current download count, and an expiry; the whole payload is signed with the
        host secret so it cannot be tampered with. Encoded ``<payload>.<mac>``.
        """
        expires_at = utc_now() + self._ttl
        payload = {
            "id": str(downloadable.id),
            "downloaded": downloadable.downloaded,
            "exp": int(expires_at.timestamp()),
        }
        payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
            "utf-8"
        )
        encoded_payload = _b64url_encode(payload_bytes)
        mac = self._sign(encoded_payload)
        return DownloadToken(token=f"{encoded_payload}.{mac}", expires_at=expires_at)

    async def redeem_token(
        self, repository: DownloadableRepository, token: str
    ) -> Downloadable:
        """Verify a download token and record the download. Fused from Polar's redeem path.

        Verifies the MAC (constant-time), enforces the TTL, loads the downloadable, and
        increments its download counter. Raises :class:`DownloadTokenInvalid` /
        :class:`DownloadTokenExpired` / :class:`DownloadableNotFound` exactly where Polar
        raised ``ResourceNotFound`` / ``ResourceUnavailable`` / ``BadRequest``.
        """
        try:
            encoded_payload, mac = token.split(".", 1)
        except ValueError as e:
            raise DownloadTokenInvalid("malformed token") from e

        if not constant_time_compare(mac, self._sign(encoded_payload)):
            raise DownloadTokenInvalid("bad signature")

        try:
            payload = json.loads(_b64url_decode(encoded_payload))
            downloadable_id = uuid.UUID(payload["id"])
            expires_at = datetime.fromtimestamp(payload["exp"], tz=utc_now().tzinfo)
        except (KeyError, ValueError, TypeError) as e:
            raise DownloadTokenInvalid("undecodable payload") from e

        if expires_at <= utc_now():
            raise DownloadTokenExpired()

        downloadable = await repository.get(downloadable_id)
        if downloadable is None:
            raise DownloadableNotFound()

        return await self._increment_download_count(repository, downloadable)

    async def _increment_download_count(
        self, repository: DownloadableRepository, downloadable: Downloadable
    ) -> Downloadable:
        downloadable.downloaded += 1
        downloadable.last_downloaded_at = utc_now()
        downloadable.modified_at = utc_now()
        return await repository.save(downloadable)

    def _sign(self, encoded_payload: str) -> str:
        digest = hmac.new(
            self._secret, encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        return _b64url_encode(digest)


__all__ = [
    "Downloadable",
    "DownloadableError",
    "DownloadableNotFound",
    "DownloadableRepository",
    "DownloadableService",
    "DownloadableStatus",
    "DownloadToken",
    "DownloadTokenExpired",
    "DownloadTokenInvalid",
]
