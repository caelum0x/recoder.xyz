"""Order creation from checkout + off-session purchases + the refund state machine.

Persistence lives behind :class:`OrderRepository`; refund issuance behind
:class:`RefundProcessor`. Both are host-supplied ports.
"""

from .service import (
    CheckoutNotPriced,
    CheckoutNotSucceeded,
    InvalidPurchaseAmount,
    MissingCheckoutCustomer,
    OrderDoesNotExist,
    OrderError,
    OrderRepository,
    OrderService,
    RefundProcessor,
    RefundResult,
    order,
)

__all__ = [
    "CheckoutNotPriced",
    "CheckoutNotSucceeded",
    "InvalidPurchaseAmount",
    "MissingCheckoutCustomer",
    "OrderDoesNotExist",
    "OrderError",
    "OrderRepository",
    "OrderService",
    "RefundProcessor",
    "RefundResult",
    "order",
]
