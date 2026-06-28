"""Subscription lifecycle. Fused from polar/subscription/service.py, owned by Recoder.

Polar's ``SubscriptionService`` is ~2700 lines bound to SQLAlchemy, the dunning
scheduler, benefit-grant jobs, meters, and Stripe. The *owned* lifecycle spine — the
state transitions that gate entitlements and billing — is small and self-contained:

- ``cancel`` / ``revoke``: schedule an end-of-period cancellation, or end immediately.
- ``uncancel``: reverse a scheduled cancellation.
- ``mark_past_due`` / ``mark_active``: dunning transitions.
- ``activate``: bring an incomplete/trialing subscription to active.

The benefit-grant and dunning side effects are emitted through a :class:`LifecycleHooks`
port (Polar enqueued worker jobs); persistence is the :class:`SubscriptionRepository`
port. Both are host-supplied — no in-package fake — so the transitions compile and are
testable without SQLAlchemy, Redis, or the worker.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Protocol

from ...kit.utils import utc_now
from ...models.subscription import Subscription, SubscriptionStatus


class SubscriptionError(Exception):
    """Base error for subscription lifecycle operations."""


class SubscriptionDoesNotExist(SubscriptionError):
    def __init__(self, subscription_id: uuid.UUID) -> None:
        self.subscription_id = subscription_id
        super().__init__(f"Subscription {subscription_id} does not exist.")


class AlreadyCanceledSubscription(SubscriptionError):
    def __init__(self, subscription: Subscription) -> None:
        self.subscription = subscription
        super().__init__(
            "This subscription is already canceled, scheduled for cancellation, "
            "or revoked."
        )


class SubscriptionNotUncancelable(SubscriptionError):
    def __init__(self, subscription: Subscription) -> None:
        self.subscription = subscription
        super().__init__(
            "This subscription has no scheduled cancellation to reverse."
        )


class SubscriptionRepository(Protocol):
    """Durable persistence port for subscriptions (satisfied by the host's DB layer)."""

    async def get(self, subscription_id: uuid.UUID) -> Subscription | None: ...

    async def save(self, subscription: Subscription) -> Subscription: ...


class LifecycleHooks(Protocol):
    """Side-effect port for lifecycle transitions.

    Polar enqueued worker jobs (``enqueue_benefits_grants``, dunning scheduling, webhook
    emission) directly inside the service. We surface them as explicit, host-implemented
    hooks so the owned transitions stay pure and the host wires the real IO. A no-op
    implementation is a valid host choice; this package never ships a fake.
    """

    async def on_canceled(
        self, subscription: Subscription, *, immediately: bool
    ) -> None: ...

    async def on_uncanceled(self, subscription: Subscription) -> None: ...

    async def on_revoked(self, subscription: Subscription) -> None: ...

    async def on_past_due(self, subscription: Subscription) -> None: ...

    async def on_activated(self, subscription: Subscription) -> None: ...


class SubscriptionService:
    """Owned subscription lifecycle over a repository + hooks port."""

    async def cancel(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
        *,
        customer_reason: str | None = None,
        customer_comment: str | None = None,
    ) -> Subscription:
        """Schedule an end-of-period cancellation. Fused from Polar's ``cancel``."""
        subscription = await self._require(repository, subscription_id)
        return await self._perform_cancellation(
            repository,
            hooks,
            subscription,
            customer_reason=customer_reason,
            customer_comment=customer_comment,
            immediately=False,
        )

    async def revoke(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
        *,
        customer_reason: str | None = None,
        customer_comment: str | None = None,
    ) -> Subscription:
        """End the subscription immediately. Fused from Polar's ``revoke``."""
        subscription = await self._require(repository, subscription_id)
        return await self._perform_cancellation(
            repository,
            hooks,
            subscription,
            customer_reason=customer_reason,
            customer_comment=customer_comment,
            immediately=True,
        )

    async def uncancel(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
    ) -> Subscription:
        """Reverse a scheduled end-of-period cancellation. Fused from Polar's ``uncancel``."""
        subscription = await self._require(repository, subscription_id)
        if subscription.ended_at:
            raise SubscriptionNotUncancelable(subscription)
        if not subscription.can_uncancel():
            raise SubscriptionNotUncancelable(subscription)

        subscription.cancel_at_period_end = False
        subscription.ends_at = None
        subscription.canceled_at = None
        subscription.customer_cancellation_reason = None
        subscription.customer_cancellation_comment = None

        saved = await repository.save(subscription)
        await hooks.on_uncanceled(saved)
        return saved

    async def mark_past_due(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
    ) -> Subscription:
        """Move an active subscription to ``past_due`` (dunning). Fused from Polar."""
        subscription = await self._require(repository, subscription_id)
        if subscription.status == SubscriptionStatus.past_due:
            return subscription
        subscription.status = SubscriptionStatus.past_due
        saved = await repository.save(subscription)
        await hooks.on_past_due(saved)
        return saved

    async def mark_active(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
    ) -> Subscription:
        """Recover a past-due subscription to ``active``. Fused from Polar's ``mark_active``."""
        subscription = await self._require(repository, subscription_id)
        previously_active = SubscriptionStatus.is_active(subscription.status)
        subscription.status = SubscriptionStatus.active
        saved = await repository.save(subscription)
        if not previously_active:
            await hooks.on_activated(saved)
        return saved

    async def activate(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription_id: uuid.UUID,
        *,
        trialing: bool = False,
        started_at: datetime | None = None,
    ) -> Subscription:
        """Bring an incomplete/trialing subscription to active (or trialing).

        Fuses Polar's activation: set the status, stamp ``started_at`` if not already set,
        and clear any scheduled cancellation. Idempotent for an already-active subscription.
        """
        subscription = await self._require(repository, subscription_id)
        target = (
            SubscriptionStatus.trialing if trialing else SubscriptionStatus.active
        )
        became_active = not SubscriptionStatus.is_active(subscription.status)

        subscription.status = target
        subscription.cancel_at_period_end = False
        if subscription.started_at is None:
            subscription.started_at = started_at or utc_now()

        saved = await repository.save(subscription)
        if became_active:
            await hooks.on_activated(saved)
        return saved

    async def _perform_cancellation(
        self,
        repository: SubscriptionRepository,
        hooks: LifecycleHooks,
        subscription: Subscription,
        *,
        customer_reason: str | None,
        customer_comment: str | None,
        immediately: bool,
    ) -> Subscription:
        """The shared cancel/revoke transition. Verbatim semantics from Polar.

        Raises :class:`AlreadyCanceledSubscription` when the subscription cannot be
        cancelled in the requested mode. Immediate cancellation ends the subscription and
        triggers benefit revocation; scheduled cancellation flags ``cancel_at_period_end``
        and sets ``ends_at`` to the period end.
        """
        if not subscription.can_cancel(immediately):
            raise AlreadyCanceledSubscription(subscription)

        now = utc_now()
        subscription.canceled_at = now
        if customer_reason:
            subscription.customer_cancellation_reason = customer_reason
        if customer_comment:
            subscription.customer_cancellation_comment = customer_comment

        if immediately:
            subscription.ends_at = now
            subscription.ended_at = now
            subscription.status = SubscriptionStatus.canceled
        else:
            subscription.cancel_at_period_end = True
            subscription.ends_at = subscription.current_period_end

        saved = await repository.save(subscription)
        await hooks.on_canceled(saved, immediately=immediately)
        if immediately:
            await hooks.on_revoked(saved)
        return saved

    async def _require(
        self, repository: SubscriptionRepository, subscription_id: uuid.UUID
    ) -> Subscription:
        subscription = await repository.get(subscription_id)
        if subscription is None:
            raise SubscriptionDoesNotExist(subscription_id)
        return subscription


subscription = SubscriptionService()


__all__ = [
    "AlreadyCanceledSubscription",
    "LifecycleHooks",
    "SubscriptionDoesNotExist",
    "SubscriptionError",
    "SubscriptionNotUncancelable",
    "SubscriptionRepository",
    "SubscriptionService",
    "subscription",
]
