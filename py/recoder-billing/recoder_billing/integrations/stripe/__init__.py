"""Stripe processor adapter: the real SDK behind the billing port boundary.

Fused from polar/integrations/stripe. :mod:`.service` is the lazy-imported SDK wrapper
(:class:`StripeService`, configured per host via :class:`StripeConfig`); :mod:`.payment`
implements the checkout / order / payout processor ports on top of it
(:class:`StripePaymentAdapter`, :class:`StripeRefundAdapter`, :class:`StripePayoutAdapter`).
Nothing here imports ``stripe`` at module load — the SDK is resolved on first real call.
"""

from .payment import (
    StripePaymentAdapter,
    StripePayoutAdapter,
    StripeRefundAdapter,
)
from .service import StripeConfig, StripeError, StripeService

__all__ = [
    "StripeConfig",
    "StripeError",
    "StripePaymentAdapter",
    "StripePayoutAdapter",
    "StripeRefundAdapter",
    "StripeService",
]
