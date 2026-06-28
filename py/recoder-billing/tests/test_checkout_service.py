"""Tests for the hosted checkout flow: create pricing + confirm/success state machine."""

import uuid

import pytest

from recoder_billing.billing.checkout.schemas import (
    CheckoutConfirm,
    CheckoutCreate,
    CheckoutValidationError,
)
from recoder_billing.billing.checkout.service import (
    CheckoutService,
    NotConfirmedCheckout,
    PaymentError,
    PaymentIntent,
)
from recoder_billing.models.checkout import CheckoutStatus
from recoder_billing.models.product import (
    Product,
    ProductPrice,
    ProductPriceAmountType,
)
from tests.memory_repositories import InMemoryCheckoutRepository

ORG = uuid.uuid4()


def _fixed_product(amount: int = 1500) -> Product:
    price = ProductPrice(amount_type=ProductPriceAmountType.fixed, price_amount=amount)
    return Product(name="Pro", organization_id=ORG, prices=[price])


def _custom_product(minimum: int = 500) -> Product:
    price = ProductPrice(
        amount_type=ProductPriceAmountType.custom, minimum_amount=minimum
    )
    return Product(name="PWYW", organization_id=ORG, prices=[price])


class _StubProcessor:
    """A real (recording) processor returning a configured intent."""

    def __init__(self, intent: PaymentIntent) -> None:
        self.intent = intent
        self.calls = 0

    async def confirm_payment(self, *, amount, currency, confirmation_token_id, idempotency_key):
        self.calls += 1
        return self.intent


@pytest.mark.asyncio
class TestCreate:
    async def test_prices_fixed_product(self) -> None:
        product = _fixed_product(1500)
        repo = InMemoryCheckoutRepository()
        create = CheckoutCreate(
            product_id=product.id,
            product_price_id=product.prices[0].id,
            customer_email="b@example.com",
        )
        checkout = await CheckoutService().create(repo, product, create)
        assert checkout.amount == 1500
        assert checkout.status == CheckoutStatus.open

    async def test_custom_amount_below_minimum_rejected(self) -> None:
        product = _custom_product(minimum=500)
        repo = InMemoryCheckoutRepository()
        create = CheckoutCreate(
            product_id=product.id,
            product_price_id=product.prices[0].id,
            amount=100,
        )
        with pytest.raises(CheckoutValidationError):
            await CheckoutService().create(repo, product, create)

    async def test_archived_product_rejected(self) -> None:
        product = _fixed_product()
        product.is_archived = True
        repo = InMemoryCheckoutRepository()
        create = CheckoutCreate(
            product_id=product.id, product_price_id=product.prices[0].id
        )
        with pytest.raises(CheckoutValidationError):
            await CheckoutService().create(repo, product, create)


@pytest.mark.asyncio
class TestConfirm:
    async def _open(self, repo, product):
        return await CheckoutService().create(
            repo,
            product,
            CheckoutCreate(
                product_id=product.id,
                product_price_id=product.prices[0].id,
                customer_email="b@example.com",
            ),
        )

    async def test_confirm_charges_and_moves_to_confirmed(self) -> None:
        product = _fixed_product(1500)
        repo = InMemoryCheckoutRepository()
        checkout = await self._open(repo, product)
        processor = _StubProcessor(PaymentIntent(intent_id="pi_1", status="succeeded"))

        result = await CheckoutService().confirm(
            repo, processor, checkout.id, CheckoutConfirm()
        )
        assert result.status == CheckoutStatus.confirmed
        assert result.payment_intent_id == "pi_1"
        assert processor.calls == 1

    async def test_confirm_payment_failure_raises(self) -> None:
        product = _fixed_product(1500)
        repo = InMemoryCheckoutRepository()
        checkout = await self._open(repo, product)
        processor = _StubProcessor(
            PaymentIntent(intent_id="pi_x", status="failed", error="declined")
        )
        with pytest.raises(PaymentError):
            await CheckoutService().confirm(
                repo, processor, checkout.id, CheckoutConfirm()
            )

    async def test_free_checkout_skips_processor(self) -> None:
        price = ProductPrice(amount_type=ProductPriceAmountType.free)
        product = Product(name="Free", organization_id=ORG, prices=[price])
        repo = InMemoryCheckoutRepository()
        checkout = await self._open(repo, product)
        processor = _StubProcessor(PaymentIntent(intent_id="x", status="succeeded"))

        result = await CheckoutService().confirm(
            repo, processor, checkout.id, CheckoutConfirm()
        )
        assert result.status == CheckoutStatus.confirmed
        assert processor.calls == 0

    async def test_confirm_requires_email(self) -> None:
        product = _fixed_product()
        repo = InMemoryCheckoutRepository()
        checkout = await CheckoutService().create(
            repo,
            product,
            CheckoutCreate(
                product_id=product.id, product_price_id=product.prices[0].id
            ),
        )
        processor = _StubProcessor(PaymentIntent(intent_id="x", status="succeeded"))
        from recoder_billing.billing.checkout.service import MissingCheckoutField

        with pytest.raises(MissingCheckoutField):
            await CheckoutService().confirm(
                repo, processor, checkout.id, CheckoutConfirm()
            )


@pytest.mark.asyncio
class TestSuccessFailure:
    async def _confirmed(self, repo, product):
        checkout = await CheckoutService().create(
            repo,
            product,
            CheckoutCreate(
                product_id=product.id,
                product_price_id=product.prices[0].id,
                customer_email="b@example.com",
            ),
        )
        processor = _StubProcessor(PaymentIntent(intent_id="pi", status="succeeded"))
        return await CheckoutService().confirm(
            repo, processor, checkout.id, CheckoutConfirm()
        )

    async def test_handle_success(self) -> None:
        product = _fixed_product()
        repo = InMemoryCheckoutRepository()
        confirmed = await self._confirmed(repo, product)
        result = await CheckoutService().handle_success(repo, confirmed.id)
        assert result.status == CheckoutStatus.succeeded

    async def test_handle_failure(self) -> None:
        product = _fixed_product()
        repo = InMemoryCheckoutRepository()
        confirmed = await self._confirmed(repo, product)
        result = await CheckoutService().handle_failure(repo, confirmed.id)
        assert result.status == CheckoutStatus.failed

    async def test_handle_success_on_open_rejected(self) -> None:
        product = _fixed_product()
        repo = InMemoryCheckoutRepository()
        checkout = await CheckoutService().create(
            repo,
            product,
            CheckoutCreate(
                product_id=product.id,
                product_price_id=product.prices[0].id,
                customer_email="b@example.com",
            ),
        )
        with pytest.raises(NotConfirmedCheckout):
            await CheckoutService().handle_success(repo, checkout.id)
