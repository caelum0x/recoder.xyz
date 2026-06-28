"""Subscription proration math. Fused from polar/subscription/update.py, owned.

Polar generates SQLAlchemy ``BillingEntry`` rows when a subscription changes plan or seat
count. The *math* — the part billing correctness depends on — is what we own here:

- ``_calculate_time_proration``: the fraction of the current period still unused.
- a product switch produces a *credit* for the unused time on the old plan and a *debit*
  for the remaining time on the new plan, except in ``reset`` mode which invoices the new
  plan in full and re-anchors the cycle.
- a seat-count change produces a single prorated debit (increase) or credit (decrease),
  computed on the *effective* (post-discount) amounts so a fixed discount is not
  double-counted.

The ORM ``BillingEntry`` is replaced by the owned :class:`ProrationEntry` value object and
discount allocation is pushed behind a :class:`DiscountAllocator` port, so the math
compiles and is unit-testable without SQLAlchemy or the discount model. The proration
factors and rounding are preserved verbatim from Polar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Protocol

from ...models.product import Product, ProductPrice
from ...models.subscription import Subscription
from ..product.guard import is_fixed_price, is_recurring_product, is_seat_price
from ..product.price_set import PriceSet


class ProrationBehavior(StrEnum):
    """How a mid-cycle change is billed. Fused from polar SubscriptionProrationBehavior."""

    invoice = "invoice"
    prorate = "prorate"
    next_period = "next_period"
    reset = "reset"

    def is_immediate(self) -> bool:
        return self in {ProrationBehavior.invoice, ProrationBehavior.reset}


class ProrationDirection(StrEnum):
    credit = "credit"
    debit = "debit"


class ProrationKind(StrEnum):
    proration = "proration"
    seats_increase = "seats_increase"
    seats_decrease = "seats_decrease"


@dataclass(frozen=True)
class ProrationEntry:
    """A single prorated charge line. Owned replacement for Polar's ``BillingEntry``.

    ``amount`` is always non-negative; ``direction`` carries the sign (credit reduces the
    next invoice, debit adds to it). ``discount_amount`` is the discount already folded
    into ``amount`` for this entry.
    """

    kind: ProrationKind
    direction: ProrationDirection
    amount: int
    currency: str
    start_timestamp: datetime
    end_timestamp: datetime
    product_price_id: object
    discount_amount: int = 0


class DiscountAllocator(Protocol):
    """Port for splitting a discount across a list of base amounts.

    Polar's ``Discount.allocate_discount_amounts`` lives on the discount ORM model and
    knows the discount's type (percentage vs fixed) and currency floors. We depend only
    on the allocation contract: given the per-price base amounts, return the discount
    applied to each, in order. The host supplies the real allocator; absence means no
    discount.
    """

    def allocate(self, base_amounts: list[int], currency: str) -> list[int]: ...


def _calculate_time_proration(
    period_start: datetime, period_end: datetime, now: datetime
) -> Decimal:
    """Fraction of the period still remaining at ``now`` (0..1). Verbatim from Polar."""
    period_total = (period_end - period_start).total_seconds()
    time_remaining = (period_end - now).total_seconds()
    if time_remaining <= 0:
        return Decimal(0)
    return Decimal(time_remaining) / Decimal(period_total)


def _collect_proratable_amounts(
    prices: list[ProductPrice], *, seats: int | None
) -> list[tuple[ProductPrice, int]]:
    """Pair each proratable price with its base amount.

    Only non-zero fixed and seat prices are prorated; free/custom/metered prices would
    only contribute a meaningless zero entry. Fused from Polar's ``_collect_proratable_amounts``.
    """
    priced_entries: list[tuple[ProductPrice, int]] = []
    for price in prices:
        if price.is_free:
            continue
        if is_fixed_price(price):
            priced_entries.append((price, price.price_amount))
        elif is_seat_price(price) and seats is not None:
            priced_entries.append((price, price.calculate_amount(seats)))
    return priced_entries


def _allocate(
    allocator: DiscountAllocator | None,
    base_amounts: list[int],
    currency: str,
) -> list[int]:
    if allocator is None or not base_amounts:
        return [0] * len(base_amounts)
    return allocator.allocate(base_amounts, currency)


def generate_product_credit_entries(
    *,
    subscription: Subscription,
    prices: list[ProductPrice],
    applies_at: datetime,
    initial_cycle_start: datetime,
    initial_cycle_end: datetime,
    discount: DiscountAllocator | None = None,
) -> list[ProrationEntry]:
    """Credit entries for the unused time on the current plan. Fused from Polar.

    Each static price contributes a credit of ``(base - discount) * pct_remaining`` over
    the remainder of the current cycle. The discount is applied immediately here (this
    cycle), never carried into the next cycle's order.
    """
    pct_remaining = _calculate_time_proration(
        initial_cycle_start, initial_cycle_end, applies_at
    )
    priced = _collect_proratable_amounts(
        PriceSet.from_prices(prices, subscription.currency).get_static_prices(),
        seats=getattr(subscription, "seats", None),
    )
    discounts = _allocate(
        discount, [base for _, base in priced], subscription.currency
    )

    entries: list[ProrationEntry] = []
    for (price, base_amount), discount_amount in zip(priced, discounts, strict=True):
        entries.append(
            ProrationEntry(
                kind=ProrationKind.proration,
                direction=ProrationDirection.credit,
                amount=round((base_amount - discount_amount) * pct_remaining),
                discount_amount=discount_amount,
                currency=subscription.currency,
                start_timestamp=applies_at,
                end_timestamp=initial_cycle_end,
                product_price_id=price.id,
            )
        )
    return entries


def generate_product_debit_entries(
    *,
    subscription: Subscription,
    new_product: Product,
    applies_at: datetime,
    new_cycle_start: datetime,
    new_cycle_end: datetime,
    discount: DiscountAllocator | None = None,
) -> list[ProrationEntry]:
    """Debit entries for the remaining time on the new plan. Fused from Polar."""
    assert is_recurring_product(new_product)
    pct_remaining = _calculate_time_proration(
        new_cycle_start, new_cycle_end, applies_at
    )
    priced = _collect_proratable_amounts(
        PriceSet.from_product(new_product, subscription.currency).get_static_prices(),
        seats=getattr(subscription, "seats", None),
    )
    discounts = _allocate(
        discount, [base for _, base in priced], subscription.currency
    )

    entries: list[ProrationEntry] = []
    for (price, base_amount), discount_amount in zip(priced, discounts, strict=True):
        entries.append(
            ProrationEntry(
                kind=ProrationKind.proration,
                direction=ProrationDirection.debit,
                amount=round((base_amount - discount_amount) * pct_remaining),
                discount_amount=discount_amount,
                currency=subscription.currency,
                start_timestamp=applies_at,
                end_timestamp=new_cycle_end,
                product_price_id=price.id,
            )
        )
    return entries


def generate_seats_proration(
    *,
    subscription: Subscription,
    seat_price: ProductPrice,
    old_seats: int,
    new_seats: int,
    applies_at: datetime,
    behavior: ProrationBehavior,
    old_discount_amount: int = 0,
    new_discount_amount: int = 0,
) -> list[ProrationEntry]:
    """A single prorated entry for a seat-count change. Fused from Polar.

    The discount is applied to the *effective* old/new amounts (not to the delta) so a
    fixed discount is not double-counted. In ``reset`` mode the full new amount is charged
    immediately at factor 1; otherwise the delta is prorated over the time remaining in
    the current cycle. Returns ``[]`` when the prorated amount rounds to zero.
    """
    old_base = seat_price.calculate_amount(old_seats)
    new_base = seat_price.calculate_amount(new_seats)
    end_timestamp = subscription.current_period_end

    if behavior == ProrationBehavior.reset:
        proration_factor = Decimal(1)
        amount_delta = new_base - new_discount_amount
        entry_discount_amount = new_discount_amount
    else:
        proration_factor = _calculate_time_proration(
            subscription.current_period_start,
            subscription.current_period_end,
            applies_at,
        )
        old_effective = old_base - old_discount_amount
        new_effective = new_base - new_discount_amount
        amount_delta = new_effective - old_effective
        entry_discount_amount = abs(new_discount_amount - old_discount_amount)

    prorated_amount = int(Decimal(amount_delta) * proration_factor)
    if prorated_amount == 0:
        return []

    if prorated_amount > 0:
        direction = ProrationDirection.debit
        kind = ProrationKind.seats_increase
    else:
        direction = ProrationDirection.credit
        kind = ProrationKind.seats_decrease
        prorated_amount = abs(prorated_amount)

    prorated_discount_amount = 0
    if entry_discount_amount > 0:
        prorated_discount_amount = int(
            Decimal(entry_discount_amount) * proration_factor
        )

    return [
        ProrationEntry(
            kind=kind,
            direction=direction,
            amount=prorated_amount,
            discount_amount=prorated_discount_amount,
            currency=subscription.currency,
            start_timestamp=applies_at,
            end_timestamp=end_timestamp,
            product_price_id=seat_price.id,
        )
    ]


__all__ = [
    "DiscountAllocator",
    "ProrationBehavior",
    "ProrationDirection",
    "ProrationEntry",
    "ProrationKind",
    "generate_product_credit_entries",
    "generate_product_debit_entries",
    "generate_seats_proration",
]
