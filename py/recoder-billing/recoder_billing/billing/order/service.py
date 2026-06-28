"""Order creation + refunds. Fused from polar/order/service.py, owned by Recoder.

Polar's ``OrderService`` is ~3100 lines welded to SQLAlchemy, invoice numbering, tax
recording, payment transactions, and the worker. The *owned* spine is the order's
amount assembly and the refund state machine:

- ``create_from_checkout``: turn a succeeded, priced checkout into the immutable order
  record (subtotal / discount / net / tax assembled from the checkout).
- ``create_purchase``: an off-session merchant charge, with the same custom-amount
  currency-bounds validation Polar enforces before finalizing.
- ``process_refund``: apply a refund through the order's owned ``update_refunds`` machine
  (``paid`` → ``partially_refunded`` → ``refunded``), guarding the refundable balance.

Persistence is the :class:`OrderRepository` port; refund issuance IO (the processor call)
is the :class:`RefundProcessor` port. Both are host-supplied — no fake — so the amount
math and refund machine compile and are testable without SQLAlchemy or a payment SDK.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from ...kit.currency import (
    format_currency,
    get_maximum_currency_amount,
    get_minimum_currency_amount,
)
from ...models.checkout import Checkout, CheckoutStatus
from ...models.order import Order, OrderBillingReason, OrderStatus, RefundAmountTooHigh
from ..checkout.guard import has_product_checkout


class OrderError(Exception):
    """Base error for order operations."""


class OrderDoesNotExist(OrderError):
    def __init__(self, order_id: uuid.UUID) -> None:
        self.order_id = order_id
        super().__init__(f"Order {order_id} does not exist.")


class CheckoutNotSucceeded(OrderError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        super().__init__(
            f"Checkout {checkout.id} has not succeeded; cannot create an order."
        )


class MissingCheckoutCustomer(OrderError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        super().__init__(
            f"Checkout {checkout.id} has no customer; cannot create an order."
        )


class CheckoutNotPriced(OrderError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        super().__init__(
            f"Checkout {checkout.id} is not pointed at a product price."
        )


class InvalidPurchaseAmount(OrderError):
    """A merchant-supplied purchase amount fell outside the currency's processor bounds."""

    def __init__(self, message: str, *, amount: int) -> None:
        super().__init__(message)
        self.amount = amount


class OrderRepository(Protocol):
    """Durable persistence port for orders (satisfied by the host's DB layer)."""

    async def get(self, order_id: uuid.UUID) -> Order | None: ...

    async def save(self, order: Order) -> Order: ...


@dataclass(frozen=True)
class RefundResult:
    """The processor's result of issuing a refund (returned by :class:`RefundProcessor`)."""

    refund_id: str
    succeeded: bool
    error: str | None = None


class RefundProcessor(Protocol):
    """Port for issuing a refund against the original charge (Stripe in the host).

    Polar inlined the processor refund call into the refund service. We push that single
    IO boundary behind this port so the owned refund state machine is exercisable without
    a payment SDK.
    """

    async def issue_refund(
        self, *, order: Order, amount: int, tax_amount: int, idempotency_key: str
    ) -> RefundResult: ...


def _validate_purchase_amount(amount: int | None, currency: str) -> None:
    """Bound a merchant-supplied custom amount to the currency's processor floor/ceiling.

    Fused from Polar's ``_validate_purchase_amount``: ``None`` / ``0`` is allowed (free
    product); a positive amount must clear the currency minimum and stay under the maximum,
    or the charge would be rejected at finalize.
    """
    if amount is None or amount == 0:
        return
    currency_minimum = get_minimum_currency_amount(currency)
    if amount < currency_minimum:
        raise InvalidPurchaseAmount(
            f"Amount must be at least {format_currency(currency_minimum, currency)}.",
            amount=amount,
        )
    currency_maximum = get_maximum_currency_amount(currency)
    if amount > currency_maximum:
        raise InvalidPurchaseAmount(
            f"Amount must be at most {format_currency(currency_maximum, currency)}.",
            amount=amount,
        )


class OrderService:
    """Owned order creation + refund processing over a repository + processor port."""

    async def create_from_checkout(
        self,
        repository: OrderRepository,
        checkout: Checkout,
        *,
        billing_reason: OrderBillingReason = OrderBillingReason.purchase,
        discount_amount: int = 0,
        tax_amount: int = 0,
        subscription_id: uuid.UUID | None = None,
    ) -> Order:
        """Create the immutable order for a succeeded, priced checkout. Fused from Polar.

        Assembles the order amounts from the checkout: ``subtotal = checkout.amount``,
        ``net = subtotal - discount``, plus the supplied tax. The checkout must have
        succeeded and carry a customer and a concrete product price.
        """
        if checkout.status != CheckoutStatus.succeeded:
            raise CheckoutNotSucceeded(checkout)
        if checkout.customer_id is None:
            raise MissingCheckoutCustomer(checkout)
        if not has_product_checkout(checkout):
            raise CheckoutNotPriced(checkout)

        subtotal = checkout.amount
        net = subtotal - discount_amount

        order = Order(
            customer_id=checkout.customer_id,
            organization_id=checkout.organization_id,
            currency=checkout.currency,
            subtotal_amount=subtotal,
            discount_amount=discount_amount,
            net_amount=net,
            tax_amount=tax_amount,
            billing_reason=billing_reason,
            status=OrderStatus.paid,
            product_id=checkout.product_id,
            subscription_id=subscription_id,
            checkout_id=checkout.id,
        )
        return await repository.save(order)

    async def create_purchase(
        self,
        repository: OrderRepository,
        *,
        customer_id: uuid.UUID,
        organization_id: uuid.UUID,
        currency: str,
        amount: int,
        product_id: uuid.UUID | None = None,
        discount_amount: int = 0,
        tax_amount: int = 0,
    ) -> Order:
        """Create an off-session merchant purchase order. Fused from Polar's draft path.

        Validates the custom ``amount`` against the currency's processor bounds before
        assembling the order. The order is created ``paid`` (the host's processor port
        is responsible for the actual charge before calling this).
        """
        _validate_purchase_amount(amount, currency)
        net = amount - discount_amount
        order = Order(
            customer_id=customer_id,
            organization_id=organization_id,
            currency=currency,
            subtotal_amount=amount,
            discount_amount=discount_amount,
            net_amount=net,
            tax_amount=tax_amount,
            billing_reason=OrderBillingReason.purchase,
            status=OrderStatus.paid,
            product_id=product_id,
        )
        return await repository.save(order)

    async def process_refund(
        self,
        repository: OrderRepository,
        processor: RefundProcessor,
        order_id: uuid.UUID,
        *,
        amount: int,
        tax_amount: int = 0,
    ) -> Order:
        """Refund an order: issue via the processor, then advance the order's machine.

        The order's own :meth:`~recoder_billing.models.order.Order.update_refunds` guards
        the refundable balance (raising :class:`RefundAmountTooHigh`) and advances
        ``paid`` → ``partially_refunded`` → ``refunded``. The processor IO is attempted
        first; a failed processor refund leaves the order unchanged.
        """
        order = await self._require(repository, order_id)
        if not order.paid:
            raise RefundAmountTooHigh(order)

        # Validate against the owned refundable balance before touching the processor.
        if amount > order.refundable_amount or tax_amount > order.refundable_tax_amount:
            raise RefundAmountTooHigh(order)

        result = await processor.issue_refund(
            order=order,
            amount=amount,
            tax_amount=tax_amount,
            idempotency_key=f"{order.id}:{order.refunded_amount}:{amount}",
        )
        if not result.succeeded:
            raise OrderError(
                f"Refund failed for order {order.id}: {result.error or 'unknown error'}"
            )

        order.update_refunds(amount, tax_amount)
        return await repository.save(order)

    async def _require(
        self, repository: OrderRepository, order_id: uuid.UUID
    ) -> Order:
        order = await repository.get(order_id)
        if order is None:
            raise OrderDoesNotExist(order_id)
        return order


order = OrderService()


__all__ = [
    "CheckoutNotPriced",
    "CheckoutNotSucceeded",
    "InvalidPurchaseAmount",
    "MissingCheckoutCustomer",
    "OrderDoesNotExist",
    "OrderError",
    "OrderRepository",
    "OrderService",
    "RefundProcessor",
    "RefundResult",
    "order",
]
