"""Subscription canonical shape. Fused from polar/models/subscription.py.

Preserves the canonical status taxonomy and the active/revoked/billable classification
that drives entitlement decisions. ORM mapping + proration math are a follow-up; the
status semantics that gate entitlements are owned here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from ..kit.utils import generate_uuid, utc_now


class SubscriptionRecurringInterval(StrEnum):
    month = "month"
    year = "year"


class SubscriptionStatus(StrEnum):
    incomplete = "incomplete"
    incomplete_expired = "incomplete_expired"
    trialing = "trialing"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
    unpaid = "unpaid"

    @classmethod
    def incomplete_statuses(cls) -> set["SubscriptionStatus"]:
        return {cls.incomplete, cls.incomplete_expired}

    @classmethod
    def active_statuses(cls) -> set["SubscriptionStatus"]:
        return {cls.trialing, cls.active}

    @classmethod
    def revoked_statuses(cls) -> set["SubscriptionStatus"]:
        return {cls.canceled, cls.unpaid}

    @classmethod
    def billable_statuses(cls) -> set["SubscriptionStatus"]:
        return cls.active_statuses() | {cls.past_due}

    @classmethod
    def is_incomplete(cls, status: "SubscriptionStatus") -> bool:
        return status in cls.incomplete_statuses()

    @classmethod
    def is_active(cls, status: "SubscriptionStatus") -> bool:
        return status in cls.active_statuses()

    @classmethod
    def is_revoked(cls, status: "SubscriptionStatus") -> bool:
        return status in cls.revoked_statuses()

    @classmethod
    def is_billable(cls, status: "SubscriptionStatus") -> bool:
        return status in cls.billable_statuses()


@dataclass
class Subscription:
    """A customer subscription. Canonical shape + entitlement-gating behavior."""

    customer_id: uuid.UUID
    product_id: uuid.UUID
    status: SubscriptionStatus
    amount: int  # minor units
    currency: str  # ISO 4217, lowercase
    recurring_interval: SubscriptionRecurringInterval
    current_period_start: datetime
    current_period_end: datetime

    id: uuid.UUID = field(default_factory=generate_uuid)
    net_amount: int = 0
    recurring_interval_count: int = 1
    cancel_at_period_end: bool = False
    started_at: datetime | None = None
    ended_at: datetime | None = None
    ends_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)

    def is_incomplete(self) -> bool:
        return SubscriptionStatus.is_incomplete(self.status)

    @property
    def is_trialing(self) -> bool:
        return self.status == SubscriptionStatus.trialing

    def active(self) -> bool:
        return SubscriptionStatus.is_active(self.status)

    def revoked(self) -> bool:
        return SubscriptionStatus.is_revoked(self.status)

    def is_billable(self) -> bool:
        return SubscriptionStatus.is_billable(self.status)

    def can_cancel(self) -> bool:
        """A subscription can be cancelled only while billable and not already ended."""
        if not SubscriptionStatus.is_billable(self.status):
            return False
        if self.ended_at:
            return False
        return True

    def is_within_current_period(self, at: datetime | None = None) -> bool:
        """Whether ``at`` (default now) falls inside the current billing period."""
        moment = at or utc_now()
        return self.current_period_start <= moment < self.current_period_end
