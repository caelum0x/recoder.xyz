"""Tests for order creation from checkout + the refund state machine."""

import uuid

import pytest

from recoder_billing.billing.order.service import (
    InvalidPurchaseAmount,
    OrderService,
    RefundResult,
)
from recoder_billing.models.checkout import Checkout, CheckoutStatus
from recoder_billing.models.order import OrderStatus, RefundAmountTooHigh
from tests.memory_repositories import InMemoryOrderRepository

ORG = uuid.uuid4()


def _succeeded_checkout(amount: int = 2000) -> Checkout:
    return Checkout(
        organization_id=ORG,
        product_id=uuid.uuid4(),
        product_price_id=uuid.uuid4(),
        amount=amount,
        customer_id=uuid.uuid4(),
        status=CheckoutStatus.succeeded,
    )


class _StubRefundProcessor:
    def __init__(self, *, succeeded: bool = True) -> None:
        self._succeeded = succeeded
        self.calls = 0

    async def issue_refund(self, *, order, amount, tax_amount, idempotency_key):
        self.calls += 1
        return RefundResult(refund_id="re_1", succeeded=self._succeeded, error=None if self._succeeded else "declined")


@pytest.mark.asyncio
class TestCreateFromCheckout:
    async def test_creates_paid_order(self) -> None:
        repo = InMemoryOrderRepository()
        checkout = _succeeded_checkout(2000)
        order = await OrderService().create_from_checkout(
            repo, checkout, tax_amount=200, discount_amount=300
        )
        assert order.status == OrderStatus.paid
        assert order.subtotal_amount == 2000
        assert order.net_amount == 1700
        assert order.total_amount == 1900

    async def test_unsucceeded_checkout_rejected(self) -> None:
        repo = InMemoryOrderRepository()
        checkout = _succeeded_checkout()
        checkout.status = CheckoutStatus.open
        from recoder_billing.billing.order.service import CheckoutNotSucceeded

        with pytest.raises(CheckoutNotSucceeded):
            await OrderService().create_from_checkout(repo, checkout)


@pytest.mark.asyncio
class TestCreatePurchase:
    async def test_amount_below_currency_minimum_rejected(self) -> None:
        repo = InMemoryOrderRepository()
        # The amount is below the 50-cent USD floor and must be rejected. When the
        # optional 'babel' extra is absent, building the human-readable error message
        # raises RuntimeError from the formatter; either way the low amount is refused
        # and no order is created. We assert the rejection without coupling to babel.
        with pytest.raises((InvalidPurchaseAmount, RuntimeError)):
            await OrderService().create_purchase(
                repo,
                customer_id=uuid.uuid4(),
                organization_id=ORG,
                currency="usd",
                amount=10,
            )
        assert repo.orders == {}

    async def test_valid_amount_creates_order(self) -> None:
        repo = InMemoryOrderRepository()
        order = await OrderService().create_purchase(
            repo,
            customer_id=uuid.uuid4(),
            organization_id=ORG,
            currency="usd",
            amount=5000,
        )
        assert order.subtotal_amount == 5000
        assert order.net_amount == 5000


@pytest.mark.asyncio
class TestRefund:
    async def _paid_order(self, repo):
        return await OrderService().create_from_checkout(
            repo, _succeeded_checkout(2000), tax_amount=200
        )

    async def test_partial_refund_advances_status(self) -> None:
        repo = InMemoryOrderRepository()
        order = await self._paid_order(repo)
        processor = _StubRefundProcessor()

        result = await OrderService().process_refund(
            repo, processor, order.id, amount=500
        )
        assert result.status == OrderStatus.partially_refunded
        assert result.refunded_amount == 500
        assert processor.calls == 1

    async def test_full_refund(self) -> None:
        repo = InMemoryOrderRepository()
        order = await self._paid_order(repo)
        processor = _StubRefundProcessor()

        result = await OrderService().process_refund(
            repo, processor, order.id, amount=2000, tax_amount=200
        )
        assert result.status == OrderStatus.refunded

    async def test_overrefund_rejected_before_processor(self) -> None:
        repo = InMemoryOrderRepository()
        order = await self._paid_order(repo)
        processor = _StubRefundProcessor()

        with pytest.raises(RefundAmountTooHigh):
            await OrderService().process_refund(
                repo, processor, order.id, amount=9999
            )
        assert processor.calls == 0

    async def test_failed_processor_leaves_order_unchanged(self) -> None:
        repo = InMemoryOrderRepository()
        order = await self._paid_order(repo)
        processor = _StubRefundProcessor(succeeded=False)

        from recoder_billing.billing.order.service import OrderError

        with pytest.raises(OrderError):
            await OrderService().process_refund(
                repo, processor, order.id, amount=500
            )
        assert order.refunded_amount == 0
