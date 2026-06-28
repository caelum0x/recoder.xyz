"""Benefit grant engine. Fused from polar/benefit/grant/service.py.

The grant/revoke state machine that drives strategies and persists :class:`BenefitGrant`
records. Reshaped for Recoder: dramatiq workers, Redis, eventstream, and webhooks are
seams (the IPC/event emission is the follow-up); the core grant/revoke algorithm —
idempotent grant lookup, strategy dispatch, shared-benefit revoke guard, failure
recording — is preserved faithfully and exercised against an in-memory repository.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from ...models.benefit_grant import BenefitGrant, BenefitGrantScope
from .grant import (
    Benefit,
    BenefitActionRequiredError,
    BenefitStrategyRegistry,
    Customer,
)


class BenefitGrantRepository(Protocol):
    """Storage boundary for benefit grants. In-memory for tests, Postgres in prod."""

    async def get_by_benefit_and_scope(
        self,
        customer: Customer,
        benefit: Benefit,
        *,
        member_id: uuid.UUID | None = None,
        scope: BenefitGrantScope,
    ) -> BenefitGrant | None: ...

    async def add(self, grant: BenefitGrant) -> BenefitGrant: ...

    async def update(self, grant: BenefitGrant) -> BenefitGrant: ...

    async def list_granted_by_benefit_and_customer(
        self, benefit: Benefit, customer: Customer
    ) -> list[BenefitGrant]: ...


class BenefitGrantService:
    """Grant / revoke a single benefit for a customer, idempotently."""

    def __init__(
        self,
        repository: BenefitGrantRepository,
        registry: BenefitStrategyRegistry,
    ) -> None:
        self._repo = repository
        self._registry = registry

    async def grant_benefit(
        self,
        customer: Customer,
        benefit: Benefit,
        *,
        member_id: uuid.UUID | None = None,
        attempt: int = 1,
        scope: BenefitGrantScope | None = None,
    ) -> BenefitGrant:
        """Materialize a benefit for a customer. Idempotent: returns the existing grant if already granted.

        Fused from BenefitGrantService.grant_benefit (worker/eventstream/webhook seams removed).
        """
        scope = scope or {}
        grant = await self._repo.get_by_benefit_and_scope(
            customer, benefit, member_id=member_id, scope=scope
        )

        if grant is None:
            grant = BenefitGrant(
                customer_id=customer.id,
                benefit_id=benefit.id,
                member_id=member_id,
                subscription_id=scope.get("subscription_id"),
                order_id=scope.get("order_id"),
                properties={},
            )
            grant = await self._repo.add(grant)
        elif grant.is_granted:
            return grant

        strategy = self._registry.get(benefit.type)
        try:
            properties = await strategy.grant(
                benefit, customer, grant.properties, attempt=attempt
            )
        except BenefitActionRequiredError as e:
            if e.grant_properties is not None:
                grant.properties = e.grant_properties
            grant.set_grant_failed(e)
        else:
            grant.properties = properties
            grant.set_granted()

        return await self._repo.update(grant)

    async def revoke_benefit(
        self,
        customer: Customer,
        benefit: Benefit,
        *,
        member_id: uuid.UUID | None = None,
        attempt: int = 1,
        scope: BenefitGrantScope | None = None,
    ) -> BenefitGrant:
        """Revoke a benefit. Idempotent, and respects shared-benefit semantics.

        Fused from BenefitGrantService.revoke_benefit: the strategy's revoke logic only
        runs when the strategy requires individual revocation OR this is the last
        remaining grant for the benefit/customer (so a benefit kept alive by another
        purchase is not torn down).
        """
        scope = scope or {}
        grant = await self._repo.get_by_benefit_and_scope(
            customer, benefit, member_id=member_id, scope=scope
        )

        if grant is None:
            grant = BenefitGrant(
                customer_id=customer.id,
                benefit_id=benefit.id,
                member_id=member_id,
                subscription_id=scope.get("subscription_id"),
                order_id=scope.get("order_id"),
                properties={},
            )
            grant = await self._repo.add(grant)
        elif grant.is_revoked:
            return grant

        strategy = self._registry.get(benefit.type)
        other_grants = await self._repo.list_granted_by_benefit_and_customer(
            benefit, customer
        )
        if strategy.should_revoke_individually or len(other_grants) < 2:
            try:
                grant.properties = await strategy.revoke(
                    benefit, customer, grant.properties, attempt=attempt
                )
            except BenefitActionRequiredError:
                pass

        grant.set_revoked()
        return await self._repo.update(grant)


def benefit_grant_service(
    repository: BenefitGrantRepository,
    registry: BenefitStrategyRegistry,
) -> BenefitGrantService:
    """Factory: build the grant engine over a repository + strategy registry."""
    return BenefitGrantService(repository, registry)
