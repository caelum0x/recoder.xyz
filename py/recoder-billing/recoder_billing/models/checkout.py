"""Checkout canonical shape. Fused from polar/models/checkout.py, owned by Recoder.

A checkout is a hosted purchase session: status machine (open → confirmed → succeeded
| failed, plus expired), the chosen product/price, buyer details collected during the
flow, and the address-field requirements that the hosted form renders.

The Polar source modelled this on top of SQLAlchemy with an ORM ``before_update`` event
to auto-expire. We keep the status machine and the address-field derivation (the real
logic the hosted form depends on) as a framework-light dataclass, and expose explicit
:meth:`expire_if_due` instead of a hidden ORM hook so behavior is testable and ownership
is honest.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import TypedDict

from ..kit.utils import generate_uuid, utc_now
from .customer import Address

DEFAULT_CHECKOUT_TTL = timedelta(hours=1)


class CheckoutStatus(StrEnum):
    open = "open"
    expired = "expired"
    confirmed = "confirmed"
    succeeded = "succeeded"
    failed = "failed"

    @classmethod
    def terminal_statuses(cls) -> set["CheckoutStatus"]:
        return {cls.expired, cls.succeeded, cls.failed}

    @classmethod
    def is_terminal(cls, status: "CheckoutStatus") -> bool:
        return status in cls.terminal_statuses()


class BillingAddressFieldMode(StrEnum):
    required = "required"
    optional = "optional"
    disabled = "disabled"


class CheckoutBillingAddressFields(TypedDict):
    country: BillingAddressFieldMode
    state: BillingAddressFieldMode
    line1: BillingAddressFieldMode
    line2: BillingAddressFieldMode
    city: BillingAddressFieldMode
    postal_code: BillingAddressFieldMode


@dataclass
class Checkout:
    """A hosted checkout session. Canonical shape + status machine + address logic."""

    organization_id: uuid.UUID
    product_id: uuid.UUID
    product_price_id: uuid.UUID
    amount: int  # upfront amount in minor units, computed at create/update time
    currency: str = "usd"

    status: CheckoutStatus = CheckoutStatus.open

    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    customer_billing_address: Address | None = None
    is_business_customer: bool = False
    require_billing_address: bool = False

    # SUBJECT LINKAGE: the opaque external subject id (the recoder userId) this
    # purchase belongs to. Recorded at create so a confirmed/succeeded checkout
    # can grant the entitlement back to the SAME subject that opened it — the
    # durable mirror of Polar's checkout ``external_customer_id``. Kept as a plain
    # string so the model never couples to the host's identity layer.
    external_customer_id: str | None = None

    # Opaque payment-intent/confirmation reference returned by the processor port.
    payment_intent_id: str | None = None

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: datetime = field(default_factory=utc_now)
    expires_at: datetime = field(
        default_factory=lambda: utc_now() + DEFAULT_CHECKOUT_TTL
    )

    @property
    def is_open(self) -> bool:
        return self.status == CheckoutStatus.open

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= utc_now()

    def expire_if_due(self, at: datetime | None = None) -> bool:
        """Transition an open-but-past-expiry checkout to ``expired``.

        Replaces Polar's hidden ORM ``before_update`` hook with an explicit call.
        Returns whether a transition happened.
        """
        moment = at or utc_now()
        if self.status == CheckoutStatus.open and self.expires_at <= moment:
            self.status = CheckoutStatus.expired
            return True
        return False

    @property
    def billing_address_fields(self) -> CheckoutBillingAddressFields:
        """Which address fields the hosted form must collect, per buyer context.

        Fused from Polar's ``Checkout.billing_address_fields``: US/business buyers (and
        any explicit ``require_billing_address``) need a full address; US/CA always need
        a state. Country is always required.
        """
        country = self.customer_billing_address.country if self.customer_billing_address else None
        is_us = country == "US"
        require = self.require_billing_address or self.is_business_customer or is_us

        state_mode = (
            BillingAddressFieldMode.required
            if country in {"US", "CA"}
            else (
                BillingAddressFieldMode.optional
                if require
                else BillingAddressFieldMode.disabled
            )
        )
        detail_mode = (
            BillingAddressFieldMode.required
            if require
            else BillingAddressFieldMode.disabled
        )
        return {
            "country": BillingAddressFieldMode.required,
            "state": state_mode,
            "line1": detail_mode,
            "line2": BillingAddressFieldMode.optional
            if require
            else BillingAddressFieldMode.disabled,
            "city": detail_mode,
            "postal_code": detail_mode,
        }


__all__ = [
    "BillingAddressFieldMode",
    "CheckoutBillingAddressFields",
    "CheckoutStatus",
    "Checkout",
    "DEFAULT_CHECKOUT_TTL",
]
