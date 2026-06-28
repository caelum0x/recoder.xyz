"""Checkout guards. Fused from polar/checkout/guard.py, owned by Recoder.

Polar's guard narrowed a SQLAlchemy ``Checkout`` to a "product checkout" via a
``TypeIs`` against the loaded ``product``/``product_price`` relationships. Our canonical
:class:`~recoder_billing.models.checkout.Checkout` always carries the product/price ids
inline (no lazy relationships), so the guard becomes a plain predicate over those ids —
same decision (is this checkout pointed at a concrete product price?), no ORM coupling.
"""

from __future__ import annotations

from ...models.checkout import Checkout


def has_product_checkout(checkout: Checkout) -> bool:
    """Whether the checkout points at a concrete product price.

    Mirrors Polar's ``has_product_checkout`` narrowing. A checkout without both a
    ``product_id`` and a ``product_price_id`` is not yet priceable and must not be
    confirmed.
    """
    return checkout.product_id is not None and checkout.product_price_id is not None


__all__ = ["has_product_checkout"]
