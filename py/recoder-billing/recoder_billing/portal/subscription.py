"""Self-serve subscription portal. Fused from polar/customer_portal/service/subscription.py,
owned by Recoder.

Polar's ``CustomerSubscriptionService`` is the customer-facing half of subscription
management: it lets a *customer* (not the merchant) view and act on their own
subscriptions — cancel at period end, reverse a scheduled cancellation, switch plan, or
change seats — gated by what the owning organization allows in its portal settings.

The *owned* spine keeps that authorization + delegation logic and routes the actual state
transition through the already-owned
:class:`~recoder_billing.billing.subscription.service.SubscriptionService`. Two boundaries
are host-supplied ports: ownership-scoped lookup
(:class:`CustomerSubscriptionRepository` — "this subscription belongs to this customer")
and the per-organization portal policy (:class:`PortalPolicy` — "is plan/seat self-update
allowed"). No SQLAlchemy, no in-package fake; the portal authorization compiles and is
testable standalone.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from ..billing.subscription.service import (
    LifecycleHooks,
    SubscriptionRepository,
    SubscriptionService,
)
from ..models.subscription import Subscription


class CustomerSubscriptionError(Exception):
    """Base error for self-serve subscription actions."""


class SubscriptionNotFound(CustomerSubscriptionError):
    def __init__(self, subscription_id: uuid.UUID) -> None:
        self.subscription_id = subscription_id
        super().__init__(
            f"Subscription {subscription_id} not found for this customer."
        )


class UpdatePlanNotAllowed(CustomerSubscriptionError):
    def __init__(self) -> None:
        super().__init__("Updating the subscription plan is not allowed.")


class UpdateSeatsNotAllowed(CustomerSubscriptionError):
    def __init__(self) -> None:
        super().__init__("Updating the subscription seats is not allowed.")


class CustomerSubscriptionRepository(SubscriptionRepository, Protocol):
    """Customer-scoped subscription persistence.

    Extends the base subscription repository with an ownership-scoped lookup so a customer
    can only ever act on a subscription they own (Polar's ``_get_readable_subscription_
    statement`` filtered by ``customer_id``).
    """

    async def get_for_customer(
        self, customer_id: uuid.UUID, subscription_id: uuid.UUID
    ) -> Subscription | None: ...


class PortalPolicy(Protocol):
    """Per-organization portal policy (Polar's ``customer_portal_subscription_update_*``).

    The owning organization decides whether customers may self-service plan and seat
    changes; the host resolves these flags for the subscription's organization.
    """

    async def allows_plan_update(self, subscription: Subscription) -> bool: ...

    async def allows_seat_update(self, subscription: Subscription) -> bool: ...


class CustomerSubscriptionService:
    """Owned self-serve subscription portal over the customer-scoped repository + policy."""

    def __init__(self, subscriptions: SubscriptionService | None = None) -> None:
        self._subscriptions = subscriptions or SubscriptionService()

    async def cancel(
        self,
        repository: CustomerSubscriptionRepository,
        hooks: LifecycleHooks,
        *,
        customer_id: uuid.UUID,
        subscription_id: uuid.UUID,
        reason: str | None = None,
        comment: str | None = None,
    ) -> Subscription:
        """Schedule an end-of-period cancellation on the customer's own subscription."""
        subscription = await self._require(repository, customer_id, subscription_id)
        return await self._subscriptions.cancel(
            repository,
            hooks,
            subscription.id,
            customer_reason=reason,
            customer_comment=comment,
        )

    async def uncancel(
        self,
        repository: CustomerSubscriptionRepository,
        hooks: LifecycleHooks,
        *,
        customer_id: uuid.UUID,
        subscription_id: uuid.UUID,
    ) -> Subscription:
        """Reverse a scheduled cancellation on the customer's own subscription."""
        subscription = await self._require(repository, customer_id, subscription_id)
        return await self._subscriptions.uncancel(repository, hooks, subscription.id)

    async def update_seats(
        self,
        repository: CustomerSubscriptionRepository,
        policy: PortalPolicy,
        *,
        customer_id: uuid.UUID,
        subscription_id: uuid.UUID,
        seats: int,
    ) -> Subscription:
        """Change the seat count, gated by the organization's portal policy.

        Fuses Polar's ``UpdateSubscriptionSeatsNotAllowed`` gate: the change is rejected
        unless the owning organization permits customer-driven seat updates.
        """
        subscription = await self._require(repository, customer_id, subscription_id)
        if not await policy.allows_seat_update(subscription):
            raise UpdateSeatsNotAllowed()
        subscription.seats = seats
        return await repository.save(subscription)

    async def update_plan(
        self,
        repository: CustomerSubscriptionRepository,
        policy: PortalPolicy,
        *,
        customer_id: uuid.UUID,
        subscription_id: uuid.UUID,
        product_id: uuid.UUID,
    ) -> Subscription:
        """Switch the subscription's product, gated by the organization's portal policy.

        Fuses Polar's ``UpdateSubscriptionPlanNotAllowed`` gate: the change is rejected
        unless the owning organization permits customer-driven plan updates.
        """
        subscription = await self._require(repository, customer_id, subscription_id)
        if not await policy.allows_plan_update(subscription):
            raise UpdatePlanNotAllowed()
        subscription.product_id = product_id
        return await repository.save(subscription)

    async def _require(
        self,
        repository: CustomerSubscriptionRepository,
        customer_id: uuid.UUID,
        subscription_id: uuid.UUID,
    ) -> Subscription:
        subscription = await repository.get_for_customer(customer_id, subscription_id)
        if subscription is None:
            raise SubscriptionNotFound(subscription_id)
        return subscription


customer_subscription = CustomerSubscriptionService()


__all__ = [
    "CustomerSubscriptionError",
    "CustomerSubscriptionRepository",
    "CustomerSubscriptionService",
    "PortalPolicy",
    "SubscriptionNotFound",
    "UpdatePlanNotAllowed",
    "UpdateSeatsNotAllowed",
    "customer_subscription",
]
