"""Checkout flow inputs. Fused from polar/checkout/schemas.py, owned by Recoder.

Polar's schemas were a large Pydantic surface bound to its API (discriminated unions
per product, custom-field validation, embed origins, …). We keep the owned subset the
hosted-checkout *flow* actually consumes — the create payload, the confirm payload, and
the custom-amount validator that both the checkout and off-session order paths share —
as framework-light dataclasses. No Pydantic import, so this compiles standalone; the host
maps its request bodies onto these shapes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from ...kit.currency import (
    format_currency,
    get_maximum_currency_amount,
    get_minimum_currency_amount,
)
from ...models.customer import Address
from ...models.product import ProductPrice
from ..product.guard import is_custom_price


class CheckoutValidationError(Exception):
    """A checkout input failed validation. Carries the field location for the host.

    Replaces Polar's ``PolarRequestValidationError`` (a Pydantic/FastAPI 422 wrapper)
    with a framework-free error the host renders. ``loc`` is the dotted field path,
    e.g. ``("body", "amount")``.
    """

    def __init__(self, message: str, *, loc: tuple[str, ...], input_value: object = None) -> None:
        super().__init__(message)
        self.loc = loc
        self.input_value = input_value


@dataclass(frozen=True)
class CheckoutCreate:
    """Validated input to open a checkout session.

    ``amount`` is only meaningful for a custom (pay-what-you-want) price; for fixed/seat
    prices the upfront amount is computed from the price set. ``seats`` is required when
    the chosen price is seat-based.
    """

    product_id: uuid.UUID
    product_price_id: uuid.UUID
    currency: str = "usd"

    amount: int | None = None
    seats: int | None = None

    customer_id: uuid.UUID | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    customer_billing_address: Address | None = None
    is_business_customer: bool = False
    require_billing_address: bool = False


@dataclass(frozen=True)
class CheckoutConfirm:
    """Buyer-supplied fields collected at confirm time.

    Any field left ``None`` here falls back to whatever was already collected on the
    checkout; the confirm gate (see :class:`..checkout.service.CheckoutService`) enforces
    that every required field is present across both.
    """

    customer_name: str | None = None
    customer_email: str | None = None
    customer_billing_address: Address | None = None
    # Opaque processor confirmation reference (e.g. a Stripe confirmation token id).
    confirmation_token_id: str | None = None


def validate_custom_price_amount(
    price: ProductPrice,
    amount: int,
    currency: str,
    loc: tuple[str, ...] = ("body", "amount"),
) -> None:
    """Validate a custom (pay-what-you-want) amount. Fused from polar/product/custom_price.py.

    Enforces, in order: non-negative; the price's configured minimum (``0`` allowed, so
    a free PWYW passes); a positive amount must clear the currency's processor floor; the
    price's configured maximum; and the currency's maximum. Shared by the checkout and
    off-session order flows so both enforce identical bounds.

    Raises :class:`CheckoutValidationError` on any violation. The caller narrows with
    :func:`..product.guard.is_custom_price` first so ``minimum_amount`` is meaningful.
    """
    if not is_custom_price(price):
        raise CheckoutValidationError(
            "Amount may only be supplied for a custom (pay-what-you-want) price.",
            loc=loc,
            input_value=amount,
        )

    if amount < 0:
        raise CheckoutValidationError(
            "Amount must be at least 0.", loc=loc, input_value=amount
        )

    if amount < price.minimum_amount:
        raise CheckoutValidationError(
            "Amount is below minimum.", loc=loc, input_value=amount
        )

    if amount > 0:
        currency_minimum = get_minimum_currency_amount(currency)
        if amount < currency_minimum:
            raise CheckoutValidationError(
                "Amount must be 0 or at least "
                f"{format_currency(currency_minimum, currency)}.",
                loc=loc,
                input_value=amount,
            )

    if price.maximum_amount is not None and amount > price.maximum_amount:
        raise CheckoutValidationError(
            "Amount is above maximum.", loc=loc, input_value=amount
        )

    currency_maximum = get_maximum_currency_amount(currency)
    if amount > currency_maximum:
        raise CheckoutValidationError(
            "Amount must be at most "
            f"{format_currency(currency_maximum, currency)}.",
            loc=loc,
            input_value=amount,
        )


__all__ = [
    "CheckoutConfirm",
    "CheckoutCreate",
    "CheckoutValidationError",
    "validate_custom_price_amount",
]
