"""Customer canonical shape. Fused from polar/models/customer.py, owned by Recoder.

A customer is the buyer record an organization bills. We keep the billing-relevant
fields — identity, email, billing address, business flag, external processor id — and
the small amount of behavior the checkout/order spine reads (tax-relevant address
derivation). Processor-account linkage and the SQLAlchemy mapping are pushed behind the
repository port; nothing here couples to a session.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from ..kit.utils import generate_uuid, utc_now


@dataclass(frozen=True)
class Address:
    """A billing address. Only ``country`` is required; the rest are optional lines.

    Country/state are ISO codes (e.g. ``"US"``, ``"CA"``). Frozen because addresses are
    value objects — a change produces a new address, never an in-place mutation.
    """

    country: str
    state: str | None = None
    city: str | None = None
    line1: str | None = None
    line2: str | None = None
    postal_code: str | None = None

    @property
    def requires_state(self) -> bool:
        """US and Canada require a state/province for tax purposes."""
        return self.country in {"US", "CA"}


@dataclass
class Customer:
    """A billable customer of an organization. Canonical shape + billing behavior."""

    organization_id: uuid.UUID
    email: str

    name: str | None = None
    billing_address: Address | None = None
    is_business: bool = False
    tax_id: tuple[str, str] | None = None  # (value, type) e.g. ("DE123…", "eu_vat")

    # Opaque external processor customer id (e.g. a Stripe customer). Owned as a plain
    # string so the model never imports a processor SDK.
    external_id: str | None = None

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: object = field(default_factory=utc_now)
    deleted_at: object | None = None

    @property
    def billing_country(self) -> str | None:
        return self.billing_address.country if self.billing_address else None

    def with_billing_address(self, address: Address) -> "Customer":
        """Return a copy with a new billing address (immutable update)."""
        return Customer(
            organization_id=self.organization_id,
            email=self.email,
            name=self.name,
            billing_address=address,
            is_business=self.is_business,
            tax_id=self.tax_id,
            external_id=self.external_id,
            id=self.id,
            created_at=self.created_at,
            deleted_at=self.deleted_at,
        )


__all__ = ["Address", "Customer"]
