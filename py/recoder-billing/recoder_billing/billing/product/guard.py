"""Price/product kind guards. Fused from polar/product/guard.py, owned by Recoder.

Polar used a SQLAlchemy single-table-inheritance hierarchy with one class per price
kind and ``isinstance`` guards plus ``TypeIs`` narrowing. Our canonical
:class:`~recoder_billing.models.product.ProductPrice` is a single dataclass tagged by
``amount_type``, so the guards become explicit tag checks — same decisions, no ORM
coupling, still standalone-testable.
"""

from __future__ import annotations

from ...models.product import Product, ProductPrice, ProductPriceAmountType


def is_fixed_price(price: ProductPrice) -> bool:
    return price.amount_type == ProductPriceAmountType.fixed


def is_custom_price(price: ProductPrice) -> bool:
    """A custom (pay-what-you-want) price."""
    return price.amount_type == ProductPriceAmountType.custom


def is_metered_price(price: ProductPrice) -> bool:
    return price.amount_type == ProductPriceAmountType.metered_unit


def is_seat_price(price: ProductPrice) -> bool:
    return price.amount_type == ProductPriceAmountType.seat_unit


def is_static_price(price: ProductPrice) -> bool:
    """A static price contributes a determinable upfront amount."""
    return price.is_static


def is_discount_applicable(price: ProductPrice) -> bool:
    """Whether a discount may be applied to this price.

    Free prices never take a discount; everything else (fixed, custom, metered, seat)
    is discount-applicable. Fused from Polar's ``is_discount_applicable``.
    """
    if price.is_free:
        return False
    return (
        is_fixed_price(price)
        or is_custom_price(price)
        or is_metered_price(price)
        or is_seat_price(price)
    )


def is_recurring_product(product: Product) -> bool:
    return product.is_recurring


__all__ = [
    "is_custom_price",
    "is_discount_applicable",
    "is_fixed_price",
    "is_metered_price",
    "is_recurring_product",
    "is_seat_price",
    "is_static_price",
]
