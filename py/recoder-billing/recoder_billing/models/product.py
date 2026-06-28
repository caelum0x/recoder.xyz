"""Product + price canonical shapes. Fused from polar/models/product.py and
polar/models/product_price.py, owned as Recoder billing shapes.

A product is a sellable thing with one or more prices. Prices come in a small set of
kinds — fixed, custom (pay-what-you-want), free, metered, seat-based — and the kind
drives upfront-amount math (see :mod:`..billing.product.price_set`).

The Polar source mapped these onto a SQLAlchemy single-table-inheritance hierarchy.
We keep the *behavior* (kind classification, amount calculation, recurring detection)
as framework-light dataclasses and push durable persistence behind a repository port,
so the pricing/checkout spine compiles and is testable without SQLAlchemy.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import StrEnum

from ..kit.utils import generate_uuid, utc_now
from .subscription import SubscriptionRecurringInterval


class ProductPriceType(StrEnum):
    one_time = "one_time"
    recurring = "recurring"


class ProductPriceAmountType(StrEnum):
    """The pricing kind of a single price line."""

    fixed = "fixed"
    custom = "custom"
    free = "free"
    metered_unit = "metered_unit"
    seat_unit = "seat_unit"


class ProductBillingType(StrEnum):
    one_time = "one_time"
    recurring = "recurring"


@dataclass
class ProductPrice:
    """A single price on a product. One canonical shape covering every amount kind.

    Only the fields relevant to a given ``amount_type`` are populated. The kind
    predicates (:meth:`is_fixed`, …) and :meth:`calculate_amount` carry the real
    behavior that the checkout/subscription math relies on.
    """

    amount_type: ProductPriceAmountType
    price_currency: str = "usd"

    # Fixed / legacy-recurring-fixed.
    price_amount: int = 0

    # Custom (pay-what-you-want): optional preset and an enforced minimum/maximum.
    preset_amount: int | None = None
    minimum_amount: int = 0
    maximum_amount: int | None = None

    # Seat-based: per-seat amount in minor units.
    price_per_seat: int = 0

    # Whether this price line is a (legacy) recurring price.
    recurring_interval: SubscriptionRecurringInterval | None = None
    is_legacy: bool = False

    id: uuid.UUID = field(default_factory=generate_uuid)
    product_id: uuid.UUID | None = None
    created_at: object = field(default_factory=utc_now)
    deleted_at: object | None = None

    @property
    def is_free(self) -> bool:
        return self.amount_type == ProductPriceAmountType.free

    @property
    def is_static(self) -> bool:
        """A static price determines an upfront amount (fixed, custom, free, seat)."""
        return self.amount_type in {
            ProductPriceAmountType.fixed,
            ProductPriceAmountType.custom,
            ProductPriceAmountType.free,
            ProductPriceAmountType.seat_unit,
        }

    @property
    def is_metered(self) -> bool:
        return self.amount_type == ProductPriceAmountType.metered_unit

    @property
    def is_recurring(self) -> bool:
        return self.recurring_interval is not None

    def calculate_amount(self, seats: int) -> int:
        """Amount in minor units for ``seats`` seats. Only valid for seat prices."""
        if self.amount_type != ProductPriceAmountType.seat_unit:
            raise ValueError("calculate_amount is only valid for seat-based prices")
        if seats < 0:
            raise ValueError("seats must be non-negative")
        return self.price_per_seat * seats


@dataclass
class Product:
    """A sellable product with one or more prices. Canonical shape + behavior."""

    name: str
    organization_id: uuid.UUID

    prices: list[ProductPrice] = field(default_factory=list)
    recurring_interval: SubscriptionRecurringInterval | None = None
    recurring_interval_count: int | None = None

    description: str | None = None
    is_archived: bool = False

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: object = field(default_factory=utc_now)
    deleted_at: object | None = None

    @property
    def is_recurring(self) -> bool:
        """Recurring when the product carries an interval, or every price is recurring.

        The second clause preserves the legacy shape where the interval lived on the
        price rather than the product.
        """
        if self.recurring_interval is not None:
            return True
        if not self.prices:
            return False
        return all(price.is_recurring for price in self.prices)

    @property
    def billing_type(self) -> ProductBillingType:
        if self.is_recurring:
            return ProductBillingType.recurring
        return ProductBillingType.one_time

    @property
    def is_legacy_recurring_price(self) -> bool:
        return any(price.is_recurring for price in self.prices)

    @property
    def has_seat_based_price(self) -> bool:
        return any(
            price.amount_type == ProductPriceAmountType.seat_unit
            for price in self.prices
        )

    def get_price(self, price_id: uuid.UUID) -> ProductPrice | None:
        for price in self.prices:
            if price.id == price_id:
                return price
        return None


__all__ = [
    "Product",
    "ProductBillingType",
    "ProductPrice",
    "ProductPriceAmountType",
    "ProductPriceType",
]
