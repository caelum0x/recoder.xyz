"""License key canonical shape. Fused from polar/models/license_key.py.

Carries the canonical fields and the real domain methods: status transitions,
validation accounting, and the masked ``display_key``. The SQLAlchemy table mapping
(unique constraint on (organization_id, key), FK cascades) is a follow-up; the shape
and behavior are owned here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from ..kit.utils import generate_uuid, utc_now


class LicenseKeyStatus(StrEnum):
    granted = "granted"
    revoked = "revoked"
    disabled = "disabled"


@dataclass
class LicenseKeyActivation:
    """A single activation (device/install) of a license key."""

    license_key_id: uuid.UUID
    label: str
    id: uuid.UUID = field(default_factory=generate_uuid)
    conditions: dict[str, str | int | float | bool] = field(default_factory=dict)
    meta: dict[str, str | int | float | bool] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)
    modified_at: datetime | None = None
    deleted_at: datetime | None = None

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def mark_deleted(self) -> None:
        self.deleted_at = utc_now()


@dataclass
class LicenseKey:
    """A license key granted to a customer for a benefit. Canonical shape + behavior."""

    organization_id: uuid.UUID
    customer_id: uuid.UUID
    benefit_id: uuid.UUID
    key: str

    id: uuid.UUID = field(default_factory=generate_uuid)
    member_id: uuid.UUID | None = None
    status: LicenseKeyStatus = LicenseKeyStatus.granted

    limit_activations: int | None = None
    usage: int = 0
    limit_usage: int | None = None
    validations: int = 0
    last_validated_at: datetime | None = None
    expires_at: datetime | None = None

    created_at: datetime = field(default_factory=utc_now)
    deleted_at: datetime | None = None

    # Transient: the activation matched during a validate() call.
    activation: LicenseKeyActivation | None = None

    @property
    def display_key(self) -> str:
        """Masked representation safe to show in UI/logs."""
        last_six_digits = self.key[-6:]
        return f"****-{last_six_digits}"

    def mark_revoked(self) -> None:
        self.status = LicenseKeyStatus.revoked

    def mark_validated(self, increment_usage: int | None = None) -> None:
        self.validations += 1
        self.last_validated_at = utc_now()
        if increment_usage:
            self.usage += increment_usage

    def is_active(self) -> bool:
        return self.status == LicenseKeyStatus.granted
