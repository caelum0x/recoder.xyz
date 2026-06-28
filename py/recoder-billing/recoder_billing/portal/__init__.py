"""Customer self-serve portal services. Fused from polar/customer_portal/service/*.

The customer-facing half of billing: a customer acting on *their own* resources —
canceling/updating a subscription (:mod:`.subscription`), reconfiguring a benefit grant
(:mod:`.benefit_grant`), and redeeming file downloads (:mod:`.downloadables`). Every
service is ownership-scoped through a host-supplied repository port and gated by the same
policy checks Polar enforced.
"""

from .benefit_grant import (
    BenefitGrantHooks,
    BenefitGrantNotFound,
    BenefitGrantRevoked,
    BenefitGrantUpdate,
    BenefitTypeMismatch,
    CustomerBenefitGrantError,
    CustomerBenefitGrantRepository,
    CustomerBenefitGrantService,
    OAuthAccountNotFound,
    OAuthAccountResolver,
    customer_benefit_grant,
)
from .downloadables import (
    Downloadable,
    DownloadableError,
    DownloadableNotFound,
    DownloadableRepository,
    DownloadableService,
    DownloadableStatus,
    DownloadToken,
    DownloadTokenExpired,
    DownloadTokenInvalid,
)
from .subscription import (
    CustomerSubscriptionError,
    CustomerSubscriptionRepository,
    CustomerSubscriptionService,
    PortalPolicy,
    SubscriptionNotFound,
    UpdatePlanNotAllowed,
    UpdateSeatsNotAllowed,
    customer_subscription,
)

__all__ = [
    "BenefitGrantHooks",
    "BenefitGrantNotFound",
    "BenefitGrantRevoked",
    "BenefitGrantUpdate",
    "BenefitTypeMismatch",
    "CustomerBenefitGrantError",
    "CustomerBenefitGrantRepository",
    "CustomerBenefitGrantService",
    "CustomerSubscriptionError",
    "CustomerSubscriptionRepository",
    "CustomerSubscriptionService",
    "Downloadable",
    "DownloadableError",
    "DownloadableNotFound",
    "DownloadableRepository",
    "DownloadableService",
    "DownloadableStatus",
    "DownloadToken",
    "DownloadTokenExpired",
    "DownloadTokenInvalid",
    "OAuthAccountNotFound",
    "OAuthAccountResolver",
    "PortalPolicy",
    "SubscriptionNotFound",
    "UpdatePlanNotAllowed",
    "UpdateSeatsNotAllowed",
    "customer_benefit_grant",
    "customer_subscription",
]
