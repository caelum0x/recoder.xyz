"""Order canonical shape. Fused from polar/models/order.py, owned by Recoder.

An order is the immutable record of a charge: subtotal, discount, tax, net, and the
refund state machine layered on top. We keep the canonical amount math and the refund
transition (``paid`` → ``partially_refunded`` → ``refunded``) — the logic billing
correctness depends on — as a framework-light dataclass. SQLAlchemy hybrid expressions
and processor linkage are pushed behind the repository port.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import StrEnum

from ..kit.utils import generate_uuid, utc_now


class OrderBillingReason(StrEnum):
    purchase = "purchase"
    subscription_create = "subscription_create"
    subscription_cycle = "subscription_cycle"
    subscription_update = "subscription_update"


class OrderStatus(StrEnum):
    draft = "draft"
    pending = "pending"
    paid = "paid"
    refunded = "refunded"
    partially_refunded = "partially_refunded"
    void = "void"

    @classmethod
    def paid_statuses(cls) -> set["OrderStatus"]:
        return {cls.paid, cls.partially_refunded, cls.refunded}


class RefundAmountTooHigh(Exception):
    """Raised when a refund exceeds an order's remaining refundable balance."""

    def __init__(self, order: "Order") -> None:
        self.order = order
        super().__init__(
            f"Refund amount exceeds remaining order balance: {order.remaining_balance}"
        )


@dataclass
class Order:
    """A charge record with refund state. Canonical amounts + refund machine."""

    customer_id: uuid.UUID
    organization_id: uuid.UUID
    currency: str

    subtotal_amount: int  # before discount, minor units
    discount_amount: int  # absolute discount applied, minor units
    net_amount: int  # subtotal - discount, what the customer is charged pre-tax
    tax_amount: int  # tax on top of net

    billing_reason: OrderBillingReason = OrderBillingReason.purchase
    status: OrderStatus = OrderStatus.pending

    # Balance credit applied (e.g. account credit). Negative reduces the amount due.
    applied_balance_amount: int = 0
    platform_fee_amount: int = 0

    refunded_amount: int = 0
    refunded_tax_amount: int = 0
    refunds_blocked_at: object | None = None

    product_id: uuid.UUID | None = None
    subscription_id: uuid.UUID | None = None
    checkout_id: uuid.UUID | None = None

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: object = field(default_factory=utc_now)

    @property
    def total_amount(self) -> int:
        """What the customer owes including tax."""
        return self.net_amount + self.tax_amount

    @property
    def due_amount(self) -> int:
        """Amount actually due after applied balance, never negative."""
        return max(0, self.total_amount + self.applied_balance_amount)

    @property
    def payout_amount(self) -> int:
        """What the organization is paid out, net of platform fee and refunds."""
        return self.net_amount - self.platform_fee_amount - self.refunded_amount

    @property
    def paid(self) -> bool:
        return self.status in OrderStatus.paid_statuses()

    @property
    def taxed(self) -> bool:
        return self.tax_amount > 0

    @property
    def refunded(self) -> bool:
        return self.status == OrderStatus.refunded

    @property
    def refunds_blocked(self) -> bool:
        return self.refunds_blocked_at is not None

    @property
    def refundable_amount(self) -> int:
        return max(
            0, self.net_amount + self.applied_balance_amount - self.refunded_amount
        )

    @property
    def refundable_tax_amount(self) -> int:
        return max(0, self.tax_amount - self.refunded_tax_amount)

    @property
    def remaining_balance(self) -> int:
        return self.refundable_amount + self.refundable_tax_amount

    def update_refunds(self, refunded_amount: int, refunded_tax_amount: int) -> None:
        """Apply a refund, advancing the status machine. Fused from Polar's logic.

        Raises :class:`RefundAmountTooHigh` if the refund (incl. tax) would exceed the
        remaining refundable balance — the guard the order/refund service relies on.
        """
        if self.refunds_blocked:
            raise RefundAmountTooHigh(self)
        if (
            refunded_amount > self.refundable_amount
            or refunded_tax_amount > self.refundable_tax_amount
        ):
            raise RefundAmountTooHigh(self)

        new_amount = self.refunded_amount + refunded_amount
        new_tax_amount = self.refunded_tax_amount + refunded_tax_amount

        if new_amount == 0:
            new_status = OrderStatus.paid
        elif new_amount >= (self.net_amount + self.applied_balance_amount):
            new_status = OrderStatus.refunded
        else:
            new_status = OrderStatus.partially_refunded

        self.status = new_status
        self.refunded_amount = new_amount
        self.refunded_tax_amount = new_tax_amount


__all__ = [
    "Order",
    "OrderBillingReason",
    "OrderStatus",
    "RefundAmountTooHigh",
]
