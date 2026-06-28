"""Price sets + upfront-amount math. Fused from polar/product/price_set.py, owned.

A :class:`PriceSet` is the subset of a product's prices for a single chosen currency.
:func:`calculate_upfront_amount` is the canonical "what does the buyer pay now" math
that the checkout flow and order creation both call. Logic is preserved verbatim from
Polar; only the imports are re-homed onto the owned :class:`ProductPrice` shape.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Self

from ...models.product import Product, ProductPrice
from .guard import (
    is_custom_price,
    is_fixed_price,
    is_seat_price,
    is_static_price,
)


class PriceSetError(Exception):
    """Base error for price-set construction."""


class NoPricesForCurrencies(PriceSetError):
    def __init__(self, currencies: list[str]) -> None:
        self.currencies = currencies
        super().__init__(f"No prices found for currencies: {currencies}")


class PriceSet:
    """The prices of a product filtered to a single currency, with selection helpers."""

    __slots__ = ("_iterable", "currency", "prices")

    def __init__(self, currency: str, prices: Sequence[ProductPrice]) -> None:
        self.currency = currency
        self.prices = prices

    def __iter__(self) -> Self:
        self._iterable = iter(self.prices)
        return self

    def __next__(self) -> ProductPrice:
        return next(self._iterable)

    def __len__(self) -> int:
        return len(self.prices)

    @classmethod
    def from_product(cls, product: Product, *currencies: str) -> Self:
        """Build a price set from a product, preferring the first currency that matches."""
        return cls.from_prices(product.prices, *currencies)

    @classmethod
    def from_prices(cls, prices: Sequence[ProductPrice], *currencies: str) -> Self:
        """Build a price set from raw prices, preferring the first matching currency.

        Raises :class:`NoPricesForCurrencies` when none of ``currencies`` are present.
        """
        for currency in currencies:
            currency_prices = [
                price for price in prices if price.price_currency == currency
            ]
            if currency_prices:
                return cls(currency=currency, prices=currency_prices)
        raise NoPricesForCurrencies([*currencies])

    def get_default_price(self) -> ProductPrice:
        """The static price (preferred), else the first price.

        The static price determines the upfront amount and any PWYW behavior, so it is
        selected first when present.
        """
        for price in self.prices:
            if is_static_price(price):
                return price
        return self.prices[0]

    def get_static_prices(self) -> list[ProductPrice]:
        return [price for price in self.prices if is_static_price(price)]

    def get_seat_price(self) -> ProductPrice | None:
        for price in self.prices:
            if is_seat_price(price):
                return price
        return None

    def get_custom_price(self) -> ProductPrice | None:
        for price in self.prices:
            if is_custom_price(price):
                return price
        return None


def calculate_upfront_amount(
    prices: Sequence[ProductPrice],
    *,
    custom_amount: int | None,
    seats: int | None,
) -> int:
    """Sum the amount charged upfront across a set of prices.

    Per-price contribution (fused from Polar):
    - fixed: its configured amount.
    - custom: the buyer-provided ``custom_amount`` (``0`` honored), else the price's
      preset (a preset of ``0`` is honored), else the minimum.
    - seat: the amount for ``seats`` seats (``seats`` must be provided).
    - free / metered: nothing upfront.
    """
    amount = 0
    for price in prices:
        if is_fixed_price(price):
            amount += price.price_amount
        elif is_custom_price(price):
            if custom_amount is not None:
                amount += custom_amount
            elif price.preset_amount is not None:
                amount += price.preset_amount
            else:
                amount += price.minimum_amount
        elif is_seat_price(price):
            if seats is None:
                raise ValueError("seats must be provided to price a seat-based price")
            amount += price.calculate_amount(seats)
    return amount


__all__ = [
    "NoPricesForCurrencies",
    "PriceSet",
    "PriceSetError",
    "calculate_upfront_amount",
]
