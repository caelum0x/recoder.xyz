"""Payout account + organization payout-eligibility. Fused from polar/account +
polar/payout, owned by Recoder.

Polar split this across ``polar/account`` (the connected-processor account, its
platform fee config and billing details) and ``polar/organization`` (the review-state
machine that gates whether an organization may request a payout). Both are welded to
SQLAlchemy and the Stripe Connect account. The *owned* spine here is the small,
pure shape + behavior the payout service actually turns on:

- :class:`PayoutAccount`: the connected account funds are paid out to — its processor,
  currency, country, opaque processor id, billing details, and the minimum-payout
  interval. No SDK, no session.
- :class:`AccountStatus`: the review-state taxonomy that decides payout eligibility,
  with the exact ``can_payout`` / ``is_held`` semantics Polar enforces (``CREATED``,
  ``DENIED``, ``OFFBOARDING``, ``BLOCKED`` cannot pay out; ``REVIEW`` / ``SNOOZED`` may
  request but the payout is *held* until approval; ``ACTIVE`` pays out immediately).

This is the data the :class:`~recoder_billing.billing.payout.service.PayoutService`
reasons over; the Stripe Connect transfer/payout IO is a separate processor port.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum

from ...kit.utils import generate_uuid, utc_now


class PayoutProcessorType(StrEnum):
    """The processor a payout account settles through."""

    stripe = "stripe"


class AccountStatus(StrEnum):
    """The review state of a payout account's owning organization.

    Mirrors Polar's ``OrganizationStatus`` for the subset that gates payouts. The
    state decides whether a payout can be requested and whether it must be *held*
    until a human approves the organization.
    """

    created = "created"
    onboarding_started = "onboarding_started"
    under_review = "under_review"
    snoozed = "snoozed"
    active = "active"
    denied = "denied"
    offboarding = "offboarding"
    blocked = "blocked"

    @classmethod
    def held_statuses(cls) -> set["AccountStatus"]:
        """States where a payout may be requested but is held pending approval."""
        return {cls.under_review, cls.snoozed}

    @classmethod
    def payable_statuses(cls) -> set["AccountStatus"]:
        """States from which a payout request is permitted at all (held or not)."""
        return {cls.active, cls.under_review, cls.snoozed}

    def can_payout(self) -> bool:
        """Whether a payout request is permitted (immediately or held). Fused from Polar."""
        return self in AccountStatus.payable_statuses()

    def is_held(self) -> bool:
        """Whether a payout requested in this state must be held until approval."""
        return self in AccountStatus.held_statuses()


@dataclass
class PayoutAccount:
    """A connected account funds are paid out to. Canonical shape + payout eligibility.

    ``processor_id`` is the opaque external account id (e.g. a Stripe Connect account)
    — owned as a plain string so the model never imports a processor SDK.
    """

    organization_id: uuid.UUID
    processor: PayoutProcessorType
    currency: str  # ISO 4217, lowercase — the account's settlement currency
    country: str  # ISO 3166-1 alpha-2

    status: AccountStatus = AccountStatus.created
    processor_id: str | None = None

    # Billing identity required to generate a payout invoice.
    billing_name: str | None = None
    billing_address: object | None = None

    # Minimum delay between two payout requests (Polar's ``payout_interval``).
    payout_interval: timedelta = field(default_factory=lambda: timedelta(days=1))

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: datetime = field(default_factory=utc_now)

    @property
    def can_payout(self) -> bool:
        """Whether this account's organization may request a payout right now."""
        return self.status.can_payout()

    @property
    def held(self) -> bool:
        """Whether a payout from this account must currently be held."""
        return self.status.is_held()

    @property
    def is_ready(self) -> bool:
        """Whether the account is wired to its processor (has a processor id)."""
        return self.processor_id is not None

    @property
    def has_billing_details(self) -> bool:
        """Whether the account carries the billing identity needed for an invoice."""
        return self.billing_name is not None and self.billing_address is not None

    def next_payout_at(self, last_payout_created_at: datetime | None) -> datetime | None:
        """Earliest time the next payout may be requested.

        Fused from Polar's ``get_next_payout_at``: ``None`` means a payout can be
        requested immediately; otherwise the timestamp the interval clears.
        """
        if last_payout_created_at is None:
            return None
        candidate = last_payout_created_at + self.payout_interval
        if candidate <= utc_now():
            return None
        return candidate


__all__ = [
    "AccountStatus",
    "PayoutAccount",
    "PayoutProcessorType",
]
