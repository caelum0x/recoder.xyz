"""Product service. Fused from polar/product/service.py, owned by Recoder.

Polar's service was wired to an async SQLAlchemy session, a repository, auth subjects,
and background benefit-grant jobs. The durable, infra-coupled parts are pushed behind a
:class:`ProductRepository` port; the *owned* logic kept here is the create/update
validation and price-set construction that the checkout/order spine actually depends on:

- a product must have at least one price;
- a recurring product's prices must agree on the recurring interval;
- archiving and price replacement go through explicit, validated transitions.

Nothing here imports SQLAlchemy, so it compiles and is unit-testable standalone. The
host supplies a real repository; there is no in-package fake.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from ...models.product import Product, ProductPrice
from ...models.subscription import SubscriptionRecurringInterval
from .guard import is_recurring_product
from .price_set import PriceSet


class ProductError(Exception):
    """Base error for product operations."""


class ProductHasNoPrices(ProductError):
    def __init__(self) -> None:
        super().__init__("A product must have at least one price.")


class InconsistentRecurringInterval(ProductError):
    def __init__(self) -> None:
        super().__init__(
            "All recurring prices on a product must share the same interval."
        )


class ProductNotFound(ProductError):
    def __init__(self, product_id: uuid.UUID) -> None:
        self.product_id = product_id
        super().__init__(f"Product {product_id} not found.")


@dataclass(frozen=True)
class ProductCreate:
    """Validated input for creating a product."""

    name: str
    organization_id: uuid.UUID
    prices: list[ProductPrice]
    recurring_interval: SubscriptionRecurringInterval | None = None
    recurring_interval_count: int | None = None
    description: str | None = None


@dataclass(frozen=True)
class ProductUpdate:
    """Partial update — only set fields are applied."""

    name: str | None = None
    description: str | None = None
    prices: list[ProductPrice] | None = None
    is_archived: bool | None = None


class ProductRepository(Protocol):
    """Durable persistence port for products (satisfied by the host's DB layer)."""

    async def get(self, product_id: uuid.UUID) -> Product | None: ...

    async def save(self, product: Product) -> Product: ...


def _validate_prices(
    prices: list[ProductPrice],
    recurring_interval: SubscriptionRecurringInterval | None,
) -> None:
    """Enforce the product price invariants. Raises :class:`ProductError` on violation."""
    if not prices:
        raise ProductHasNoPrices()

    recurring_intervals = {
        price.recurring_interval
        for price in prices
        if price.recurring_interval is not None
    }
    if len(recurring_intervals) > 1:
        raise InconsistentRecurringInterval()
    if (
        recurring_interval is not None
        and recurring_intervals
        and recurring_interval not in recurring_intervals
    ):
        raise InconsistentRecurringInterval()


class ProductService:
    """Owned product business logic over a repository port."""

    async def create(
        self, repository: ProductRepository, create: ProductCreate
    ) -> Product:
        _validate_prices(create.prices, create.recurring_interval)
        product = Product(
            name=create.name,
            organization_id=create.organization_id,
            prices=list(create.prices),
            recurring_interval=create.recurring_interval,
            recurring_interval_count=create.recurring_interval_count,
            description=create.description,
        )
        return await repository.save(product)

    async def update(
        self,
        repository: ProductRepository,
        product_id: uuid.UUID,
        update: ProductUpdate,
    ) -> Product:
        product = await repository.get(product_id)
        if product is None:
            raise ProductNotFound(product_id)

        if update.name is not None:
            product.name = update.name
        if update.description is not None:
            product.description = update.description
        if update.prices is not None:
            _validate_prices(update.prices, product.recurring_interval)
            product.prices = list(update.prices)
        if update.is_archived is not None:
            product.is_archived = update.is_archived

        return await repository.save(product)

    def price_set(self, product: Product, *currencies: str) -> PriceSet:
        """Build the currency-scoped price set used to price a checkout."""
        return PriceSet.from_product(product, *currencies)

    def is_recurring(self, product: Product) -> bool:
        return is_recurring_product(product)


product = ProductService()


__all__ = [
    "InconsistentRecurringInterval",
    "ProductCreate",
    "ProductError",
    "ProductHasNoPrices",
    "ProductNotFound",
    "ProductRepository",
    "ProductService",
    "ProductUpdate",
    "product",
]
