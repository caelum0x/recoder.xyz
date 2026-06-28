"""Canonical billing shapes, fused from polar/models/*.

These are framework-light dataclasses carrying the canonical fields AND the real
domain methods (status transitions, validation flags). The SQLAlchemy ORM mapping is
a follow-up fusion; the durable shape and behavior live here so the entitlement spine
is real and testable today.
"""

from .benefit_grant import BenefitGrant, BenefitGrantError, BenefitGrantScope
from .checkout import (
    BillingAddressFieldMode,
    Checkout,
    CheckoutBillingAddressFields,
    CheckoutStatus,
)
from .customer import Address, Customer
from .license_key import LicenseKey, LicenseKeyActivation, LicenseKeyStatus
from .order import Order, OrderBillingReason, OrderStatus, RefundAmountTooHigh
from .product import (
    Product,
    ProductBillingType,
    ProductPrice,
    ProductPriceAmountType,
    ProductPriceType,
)
from .subscription import (
    Subscription,
    SubscriptionRecurringInterval,
    SubscriptionStatus,
)

__all__ = [
    "Address",
    "BenefitGrant",
    "BenefitGrantError",
    "BenefitGrantScope",
    "BillingAddressFieldMode",
    "Checkout",
    "CheckoutBillingAddressFields",
    "CheckoutStatus",
    "Customer",
    "LicenseKey",
    "LicenseKeyActivation",
    "LicenseKeyStatus",
    "Order",
    "OrderBillingReason",
    "OrderStatus",
    "Product",
    "ProductBillingType",
    "ProductPrice",
    "ProductPriceAmountType",
    "ProductPriceType",
    "RefundAmountTooHigh",
    "Subscription",
    "SubscriptionRecurringInterval",
    "SubscriptionStatus",
]
