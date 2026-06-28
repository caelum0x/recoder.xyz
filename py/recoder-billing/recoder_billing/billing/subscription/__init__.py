"""Subscription lifecycle transitions + mid-cycle proration math.

Lifecycle side effects (benefit grants, dunning, webhooks) live behind
:class:`LifecycleHooks`; persistence behind :class:`SubscriptionRepository`. Proration
discount allocation lives behind :class:`DiscountAllocator`. All ports are host-supplied.
"""

from .service import (
    AlreadyCanceledSubscription,
    LifecycleHooks,
    SubscriptionDoesNotExist,
    SubscriptionError,
    SubscriptionNotUncancelable,
    SubscriptionRepository,
    SubscriptionService,
    subscription,
)
from .update import (
    DiscountAllocator,
    ProrationBehavior,
    ProrationDirection,
    ProrationEntry,
    ProrationKind,
    generate_product_credit_entries,
    generate_product_debit_entries,
    generate_seats_proration,
)

__all__ = [
    "AlreadyCanceledSubscription",
    "DiscountAllocator",
    "LifecycleHooks",
    "ProrationBehavior",
    "ProrationDirection",
    "ProrationEntry",
    "ProrationKind",
    "SubscriptionDoesNotExist",
    "SubscriptionError",
    "SubscriptionNotUncancelable",
    "SubscriptionRepository",
    "SubscriptionService",
    "generate_product_credit_entries",
    "generate_product_debit_entries",
    "generate_seats_proration",
    "subscription",
]
