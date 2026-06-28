"""Benefit grant canonical shape. Fused from polar/models/benefit_grant.py.

A benefit grant is the durable record that a customer (optionally a member) holds a
benefit, scoped to a subscription or a one-off order. Carries the canonical state
machine: granted / revoked / failed, with the error payload preserved. ORM mapping
(composite scope, partial unique index) is a follow-up; the state transitions are
owned here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, TypedDict

from ..kit.utils import generate_uuid, utc_now


class BenefitGrantError(TypedDict):
    message: str
    type: str
    timestamp: str


class BenefitGrantScope(TypedDict, total=False):
    """The scope a grant is attached to: a subscription and/or a one-off order."""

    subscription_id: uuid.UUID
    order_id: uuid.UUID


@dataclass
class BenefitGrant:
    """A benefit granted to a customer/member. Canonical shape + state machine."""

    customer_id: uuid.UUID
    benefit_id: uuid.UUID

    id: uuid.UUID = field(default_factory=generate_uuid)
    member_id: uuid.UUID | None = None
    subscription_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None

    granted_at: datetime | None = None
    revoked_at: datetime | None = None

    # Strategy-specific grant output (e.g. the license key value, a download URL).
    properties: dict[str, Any] = field(default_factory=dict)
    error: BenefitGrantError | None = None

    created_at: datetime = field(default_factory=utc_now)
    modified_at: datetime | None = None
    deleted_at: datetime | None = None

    @property
    def is_granted(self) -> bool:
        return self.granted_at is not None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def scope(self) -> BenefitGrantScope:
        scope: BenefitGrantScope = {}
        if self.subscription_id is not None:
            scope["subscription_id"] = self.subscription_id
        if self.order_id is not None:
            scope["order_id"] = self.order_id
        return scope

    def set_granted(self) -> None:
        self.granted_at = utc_now()
        self.revoked_at = None
        self.error = None

    def set_revoked(self) -> None:
        self.granted_at = None
        self.revoked_at = utc_now()

    def set_grant_failed(self, error: Exception) -> None:
        self.granted_at = None
        self.revoked_at = None
        self.error = BenefitGrantError(
            message=str(error),
            type=error.__class__.__name__,
            timestamp=utc_now().isoformat(),
        )
