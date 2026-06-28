"""Tests for the subscription lifecycle transitions: cancel / revoke / uncancel."""

import uuid
from datetime import timedelta

import pytest

from recoder_billing.billing.subscription.service import (
    AlreadyCanceledSubscription,
    SubscriptionNotUncancelable,
    SubscriptionService,
)
from recoder_billing.kit.utils import utc_now
from recoder_billing.models.subscription import (
    Subscription,
    SubscriptionRecurringInterval,
    SubscriptionStatus,
)
from tests.memory_repositories import (
    InMemorySubscriptionRepository,
    RecordingLifecycleHooks,
)


def _active_subscription() -> Subscription:
    now = utc_now()
    return Subscription(
        customer_id=uuid.uuid4(),
        product_id=uuid.uuid4(),
        status=SubscriptionStatus.active,
        amount=1500,
        currency="usd",
        recurring_interval=SubscriptionRecurringInterval.month,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        started_at=now,
    )


@pytest.mark.asyncio
class TestCancel:
    async def test_cancel_schedules_end_of_period(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        result = await SubscriptionService().cancel(repo, hooks, sub.id)
        assert result.cancel_at_period_end is True
        assert result.ends_at == sub.current_period_end
        assert result.status == SubscriptionStatus.active
        assert hooks.canceled == [False]

    async def test_revoke_ends_immediately(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        result = await SubscriptionService().revoke(repo, hooks, sub.id)
        assert result.status == SubscriptionStatus.canceled
        assert result.ended_at is not None
        assert hooks.revoked == 1

    async def test_double_cancel_rejected(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        await SubscriptionService().cancel(repo, hooks, sub.id)
        with pytest.raises(AlreadyCanceledSubscription):
            await SubscriptionService().cancel(repo, hooks, sub.id)


@pytest.mark.asyncio
class TestUncancel:
    async def test_uncancel_reverses_schedule(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        await SubscriptionService().cancel(repo, hooks, sub.id)
        result = await SubscriptionService().uncancel(repo, hooks, sub.id)
        assert result.cancel_at_period_end is False
        assert result.ends_at is None
        assert result.canceled_at is None
        assert hooks.uncanceled == 1

    async def test_uncancel_without_schedule_rejected(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        with pytest.raises(SubscriptionNotUncancelable):
            await SubscriptionService().uncancel(repo, hooks, sub.id)


@pytest.mark.asyncio
class TestDunning:
    async def test_mark_past_due_then_active(self) -> None:
        repo = InMemorySubscriptionRepository()
        hooks = RecordingLifecycleHooks()
        sub = _active_subscription()
        await repo.save(sub)

        past_due = await SubscriptionService().mark_past_due(repo, hooks, sub.id)
        assert past_due.status == SubscriptionStatus.past_due
        assert hooks.past_due == 1

        active = await SubscriptionService().mark_active(repo, hooks, sub.id)
        assert active.status == SubscriptionStatus.active
        assert hooks.activated == 1
