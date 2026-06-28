"""License key service. Fused from polar/license_key/service.py.

Reshaped for Recoder: storage is behind a :class:`LicenseKeyRepository` Protocol so the
real issue/validate/activate algorithms are exercised today against an in-memory store,
and a Postgres repository can be dropped in unchanged later. The validation logic —
status checks, expiry, activation conditions, usage accounting — is preserved
faithfully from upstream.

This is the core billing -> entitlement primitive: a purchased license-key benefit is
granted here, then the customer's app validates/activates the key against this service.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol

from ...kit.utils import generate_uuid, utc_now
from ...models.license_key import (
    LicenseKey,
    LicenseKeyActivation,
    LicenseKeyStatus,
)
from ..exceptions import BadRequest, NotPermitted, ResourceNotFound

Timeframe = Literal["year", "month", "day"]


def _add_relative(now: datetime, ttl: int, timeframe: Timeframe) -> datetime:
    """Add ``ttl`` years/months/days to ``now`` using stdlib only.

    Replaces upstream's dateutil.relativedelta dependency. Month/year arithmetic clamps
    the day to the target month's length (e.g. Jan 31 + 1 month -> Feb 28/29).
    """
    if timeframe == "day":
        from datetime import timedelta

        return now + timedelta(days=ttl)

    if timeframe == "month":
        month_index = now.month - 1 + ttl
        year = now.year + month_index // 12
        month = month_index % 12 + 1
    else:  # year
        year = now.year + ttl
        month = now.month

    # Clamp day to the last valid day of the target month.
    if month == 12:
        next_month_year, next_month = year + 1, 1
    else:
        next_month_year, next_month = year, month + 1
    last_day = (datetime(next_month_year, next_month, 1) - _ONE_DAY).day
    day = min(now.day, last_day)
    return now.replace(year=year, month=month, day=day)


from datetime import timedelta as _td  # noqa: E402

_ONE_DAY = _td(days=1)


@dataclass(frozen=True)
class LicenseKeyValidateRequest:
    key: str
    organization_id: uuid.UUID
    activation_id: uuid.UUID | None = None
    benefit_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    increment_usage: int | None = None
    conditions: dict[str, str | int | float | bool] = field(default_factory=dict)


@dataclass(frozen=True)
class LicenseKeyActivateRequest:
    key: str
    organization_id: uuid.UUID
    label: str
    conditions: dict[str, str | int | float | bool] = field(default_factory=dict)
    meta: dict[str, str | int | float | bool] = field(default_factory=dict)


@dataclass(frozen=True)
class LicenseKeyDeactivateRequest:
    key: str
    organization_id: uuid.UUID
    activation_id: uuid.UUID


class LicenseKeyRepository(Protocol):
    """Storage boundary for license keys. Implemented in-memory for tests, Postgres in prod."""

    async def get_by_organization_and_key(
        self, organization_id: uuid.UUID, key: str
    ) -> LicenseKey | None: ...

    async def add(self, license_key: LicenseKey) -> LicenseKey: ...

    async def update(self, license_key: LicenseKey) -> LicenseKey: ...

    async def get_activation(
        self, license_key_id: uuid.UUID, activation_id: uuid.UUID
    ) -> LicenseKeyActivation | None: ...

    async def add_activation(
        self, activation: LicenseKeyActivation
    ) -> LicenseKeyActivation: ...

    async def update_activation(
        self, activation: LicenseKeyActivation
    ) -> LicenseKeyActivation: ...

    async def count_active_activations(self, license_key_id: uuid.UUID) -> int: ...


def generate_key(prefix: str | None = None) -> str:
    """Generate a license key value. Fused from LicenseKeyCreate.generate_key."""
    key = str(generate_uuid()).upper()
    if prefix is None:
        return key
    prefix = prefix.strip().upper()
    return f"{prefix}-{key}"


def generate_expiration_dt(ttl: int, timeframe: Timeframe) -> datetime:
    """Compute an expiry from a ttl/timeframe. Fused from LicenseKeyCreate."""
    try:
        return _add_relative(utc_now(), ttl, timeframe)
    except (ValueError, OverflowError) as e:
        raise ValueError(
            f"Expiration date overflows: ttl={ttl} with timeframe='{timeframe}' "
            f"produces a date beyond year 9999."
        ) from e


class LicenseKeyService:
    """Issue / validate / activate / deactivate license keys."""

    def __init__(self, repository: LicenseKeyRepository) -> None:
        self._repo = repository

    async def issue(
        self,
        *,
        organization_id: uuid.UUID,
        customer_id: uuid.UUID,
        benefit_id: uuid.UUID,
        prefix: str | None = None,
        key: str | None = None,
        limit_usage: int | None = None,
        limit_activations: int | None = None,
        expires_ttl: int | None = None,
        expires_timeframe: Timeframe | None = None,
        member_id: uuid.UUID | None = None,
    ) -> LicenseKey:
        """Mint and persist a new license key (the grant primitive). Fused from customer_grant."""
        expires_at: datetime | None = None
        if expires_ttl and expires_timeframe:
            expires_at = generate_expiration_dt(expires_ttl, expires_timeframe)

        license_key = LicenseKey(
            organization_id=organization_id,
            customer_id=customer_id,
            benefit_id=benefit_id,
            member_id=member_id,
            key=key if key is not None else generate_key(prefix=prefix),
            status=LicenseKeyStatus.granted,
            limit_usage=limit_usage,
            limit_activations=limit_activations,
            expires_at=expires_at,
        )
        return await self._repo.add(license_key)

    async def get_or_raise(
        self, *, organization_id: uuid.UUID, key: str
    ) -> LicenseKey:
        lk = await self._repo.get_by_organization_and_key(organization_id, key)
        if lk is None:
            raise ResourceNotFound("License key not found.")
        return lk

    async def validate(
        self, request: LicenseKeyValidateRequest
    ) -> LicenseKey:
        """Validate a license key. Fused from LicenseKeyService.validate.

        Enforces, in order: status active, not expired, activation match + conditions,
        benefit match, customer match, sufficient remaining usage. On success, records a
        validation and optionally increments usage.
        """
        license_key = await self.get_or_raise(
            organization_id=request.organization_id, key=request.key
        )

        if not license_key.is_active():
            raise ResourceNotFound("License key is no longer active.")

        if license_key.expires_at and utc_now() >= license_key.expires_at:
            raise ResourceNotFound("License key has expired.")

        if request.activation_id:
            activation = await self._get_activation_or_raise(
                license_key, request.activation_id
            )
            if activation.conditions and request.conditions != activation.conditions:
                raise ResourceNotFound("License key does not match required conditions")
            license_key.activation = activation

        if request.benefit_id and request.benefit_id != license_key.benefit_id:
            raise ResourceNotFound("License key does not match given benefit.")

        if request.customer_id and request.customer_id != license_key.customer_id:
            raise ResourceNotFound("License key does not match given user.")

        if request.increment_usage and license_key.limit_usage:
            remaining = license_key.limit_usage - license_key.usage
            if request.increment_usage > remaining:
                raise BadRequest(f"License key only has {remaining} more usages.")

        license_key.mark_validated(increment_usage=request.increment_usage)
        await self._repo.update(license_key)
        return license_key

    async def activate(
        self, request: LicenseKeyActivateRequest
    ) -> LicenseKeyActivation:
        """Activate a license key on a device/install. Fused from LicenseKeyService.activate."""
        license_key = await self.get_or_raise(
            organization_id=request.organization_id, key=request.key
        )

        if license_key.deleted_at is not None:
            raise ResourceNotFound("License key not found.")

        if not license_key.is_active():
            raise NotPermitted(
                "License key is no longer active. This license key can not be activated."
            )

        if license_key.expires_at and utc_now() >= license_key.expires_at:
            raise NotPermitted("License key has expired.")

        if not license_key.limit_activations:
            raise NotPermitted(
                "This license key does not support activations. "
                "Use validate instead to check license validity."
            )

        current = await self._repo.count_active_activations(license_key.id)
        if current >= license_key.limit_activations:
            raise NotPermitted("License key activation limit already reached")

        activation = LicenseKeyActivation(
            license_key_id=license_key.id,
            label=request.label,
            conditions=request.conditions,
            meta=request.meta,
        )
        return await self._repo.add_activation(activation)

    async def deactivate(
        self, request: LicenseKeyDeactivateRequest
    ) -> bool:
        """Deactivate (soft-delete) an activation. Fused from LicenseKeyService.deactivate."""
        license_key = await self.get_or_raise(
            organization_id=request.organization_id, key=request.key
        )
        activation = await self._get_activation_or_raise(
            license_key, request.activation_id
        )
        activation.mark_deleted()
        await self._repo.update_activation(activation)
        return True

    async def revoke(self, license_key: LicenseKey) -> LicenseKey:
        """Revoke a license key (e.g. on benefit revocation). Fused from customer_revoke."""
        license_key.mark_revoked()
        return await self._repo.update(license_key)

    async def _get_activation_or_raise(
        self, license_key: LicenseKey, activation_id: uuid.UUID
    ) -> LicenseKeyActivation:
        activation = await self._repo.get_activation(license_key.id, activation_id)
        if activation is None or activation.is_deleted:
            raise ResourceNotFound("Activation not found.")
        activation.license_key_id = license_key.id
        return activation


def license_key_service(repository: LicenseKeyRepository) -> LicenseKeyService:
    """Factory: build a service over a repository implementation."""
    return LicenseKeyService(repository)
