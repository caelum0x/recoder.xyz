"""Tests for the mid-cycle proration math (product switch + seat change)."""

import uuid
from datetime import timedelta

from recoder_billing.billing.subscription.update import (
    ProrationBehavior,
    ProrationDirection,
    ProrationKind,
    generate_seats_proration,
)
from recoder_billing.kit.utils import utc_now
from recoder_billing.models.product import ProductPrice, ProductPriceAmountType
from recoder_billing.models.subscription import (
    Subscription,
    SubscriptionRecurringInterval,
    SubscriptionStatus,
)


def _subscription() -> Subscription:
    now = utc_now()
    return Subscription(
        customer_id=uuid.uuid4(),
        product_id=uuid.uuid4(),
        status=SubscriptionStatus.active,
        amount=0,
        currency="usd",
        recurring_interval=SubscriptionRecurringInterval.month,
        current_period_start=now - timedelta(days=15),
        current_period_end=now + timedelta(days=15),
        seats=5,
    )


def _seat_price(per_seat: int = 1000) -> ProductPrice:
    return ProductPrice(
        amount_type=ProductPriceAmountType.seat_unit, price_per_seat=per_seat
    )


class TestSeatProration:
    def test_seat_increase_produces_prorated_debit(self) -> None:
        sub = _subscription()
        entries = generate_seats_proration(
            subscription=sub,
            seat_price=_seat_price(1000),
            old_seats=5,
            new_seats=10,
            applies_at=utc_now(),
            behavior=ProrationBehavior.prorate,
        )
        assert len(entries) == 1
        entry = entries[0]
        assert entry.direction == ProrationDirection.debit
        assert entry.kind == ProrationKind.seats_increase
        # ~half the period remains; delta is 5 seats * $10 = $50 -> ~$25 prorated.
        assert 2200 <= entry.amount <= 2800

    def test_seat_decrease_produces_credit(self) -> None:
        sub = _subscription()
        entries = generate_seats_proration(
            subscription=sub,
            seat_price=_seat_price(1000),
            old_seats=10,
            new_seats=5,
            applies_at=utc_now(),
            behavior=ProrationBehavior.prorate,
        )
        assert len(entries) == 1
        assert entries[0].direction == ProrationDirection.credit
        assert entries[0].kind == ProrationKind.seats_decrease

    def test_reset_charges_full_new_amount(self) -> None:
        sub = _subscription()
        entries = generate_seats_proration(
            subscription=sub,
            seat_price=_seat_price(1000),
            old_seats=5,
            new_seats=8,
            applies_at=utc_now(),
            behavior=ProrationBehavior.reset,
        )
        assert len(entries) == 1
        # Reset: factor 1 over the full new amount (8 * $10 = $80).
        assert entries[0].amount == 8000

    def test_no_change_yields_no_entries(self) -> None:
        sub = _subscription()
        entries = generate_seats_proration(
            subscription=sub,
            seat_price=_seat_price(1000),
            old_seats=5,
            new_seats=5,
            applies_at=utc_now(),
            behavior=ProrationBehavior.prorate,
        )
        assert entries == []
