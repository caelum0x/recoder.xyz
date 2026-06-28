"""Canonical billing shapes, fused from polar/models/*.

These are framework-light dataclasses carrying the canonical fields AND the real
domain methods (status transitions, validation flags). The SQLAlchemy ORM mapping is
a follow-up fusion; the durable shape and behavior live here so the entitlement spine
is real and testable today.
"""

from .benefit_grant import BenefitGrant, BenefitGrantError, BenefitGrantScope
from .license_key import LicenseKey, LicenseKeyActivation, LicenseKeyStatus
from .subscription import Subscription, SubscriptionStatus

__all__ = [
    "BenefitGrant",
    "BenefitGrantError",
    "BenefitGrantScope",
    "LicenseKey",
    "LicenseKeyActivation",
    "LicenseKeyStatus",
    "Subscription",
    "SubscriptionStatus",
]
