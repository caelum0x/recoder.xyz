"""Tests for the internal billing operations map wired onto the IPC surface."""

import uuid

import pytest

from recoder_billing.billing.checkout.service import PaymentIntent
from recoder_billing.ipc.operations import BillingPorts, build_billing_operations
from recoder_billing.models.product import (
    Product,
    ProductPrice,
    ProductPriceAmountType,
)
from tests.memory_repositories import (
    InMemoryCheckoutRepository,
    InMemoryProductLookup,
)

ORG = uuid.uuid4()


class _StubProcessor:
    async def confirm_payment(self, *, amount, currency, confirmation_token_id, idempotency_key):
        return PaymentIntent(intent_id="pi_1", status="succeeded")


def test_operations_only_registered_for_supplied_ports() -> None:
    # No ports -> no operations registered.
    operations = build_billing_operations(BillingPorts())
    assert operations == {}


def test_checkout_operations_registered_with_ports() -> None:
    lookup = InMemoryProductLookup()
    ports = BillingPorts(
        checkout_repository=InMemoryCheckoutRepository(),
        product_lookup=lookup,
        payment_processor=_StubProcessor(),
    )
    operations = build_billing_operations(ports)
    assert "checkout.create" in operations
    assert "checkout.confirm" in operations


@pytest.mark.asyncio
async def test_checkout_create_operation_prices_and_opens() -> None:
    lookup = InMemoryProductLookup()
    price = ProductPrice(amount_type=ProductPriceAmountType.fixed, price_amount=2500)
    product = Product(name="Pro", organization_id=ORG, prices=[price])
    lookup.add(product)

    ports = BillingPorts(
        checkout_repository=InMemoryCheckoutRepository(),
        product_lookup=lookup,
    )
    operations = build_billing_operations(ports)

    result = await operations["checkout.create"](
        {
            "product_id": str(product.id),
            "product_price_id": str(price.id),
            "customer_email": "b@example.com",
        }
    )
    assert result["amount"] == 2500
    assert result["status"] == "open"


@pytest.mark.asyncio
async def test_checkout_create_unknown_product_returns_error() -> None:
    ports = BillingPorts(
        checkout_repository=InMemoryCheckoutRepository(),
        product_lookup=InMemoryProductLookup(),
    )
    operations = build_billing_operations(ports)
    result = await operations["checkout.create"](
        {
            "product_id": str(uuid.uuid4()),
            "product_price_id": str(uuid.uuid4()),
        }
    )
    assert result["error"] == "product_not_found"
