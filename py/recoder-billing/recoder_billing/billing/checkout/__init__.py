"""Hosted checkout flow: create, update, confirm, success/failure state machine.

The Stripe-confirm IO lives behind :class:`PaymentProcessor`; persistence behind
:class:`CheckoutRepository`. Both are host-supplied ports.
"""

from .guard import has_product_checkout
from .schemas import (
    CheckoutConfirm,
    CheckoutCreate,
    CheckoutValidationError,
    validate_custom_price_amount,
)
from .service import (
    CheckoutDoesNotExist,
    CheckoutError,
    CheckoutRepository,
    CheckoutService,
    ExpiredCheckout,
    MissingCheckoutField,
    NotConfirmedCheckout,
    NotOpenCheckout,
    PaymentError,
    PaymentIntent,
    PaymentProcessor,
    checkout,
)

__all__ = [
    "CheckoutConfirm",
    "CheckoutCreate",
    "CheckoutDoesNotExist",
    "CheckoutError",
    "CheckoutRepository",
    "CheckoutService",
    "CheckoutValidationError",
    "ExpiredCheckout",
    "MissingCheckoutField",
    "NotConfirmedCheckout",
    "NotOpenCheckout",
    "PaymentError",
    "PaymentIntent",
    "PaymentProcessor",
    "checkout",
    "has_product_checkout",
    "validate_custom_price_amount",
]
