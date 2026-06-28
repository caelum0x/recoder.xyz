"""Self-serve benefit-grant portal. Fused from polar/customer_portal/service/benefit_grant.py,
owned by Recoder.

Polar's ``CustomerBenefitGrantService`` lets a customer view and reconfigure their own
benefit grants — e.g. point a Discord/GitHub grant at a different connected OAuth account —
without ever touching the merchant surface. The *owned* spine keeps the customer-scoped
read + the update guards that matter:

- a revoked grant cannot be updated,
- an update's declared benefit type must match the grant's actual benefit,
- a re-target's referenced OAuth account must be one the customer actually holds.

A successful property change clears the grant's error and re-arms it for the grant engine
(Polar enqueued ``benefit.update``); that re-grant side effect is surfaced through the
:class:`BenefitGrantHooks` port. Ownership-scoped persistence is the
:class:`CustomerBenefitGrantRepository` port. Both host-supplied — no fake — so the portal
update logic compiles and is testable without SQLAlchemy or the worker.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from ..models.benefit_grant import BenefitGrant


class CustomerBenefitGrantError(Exception):
    """Base error for self-serve benefit-grant actions."""


class BenefitGrantNotFound(CustomerBenefitGrantError):
    def __init__(self, grant_id: uuid.UUID) -> None:
        self.grant_id = grant_id
        super().__init__(f"Benefit grant {grant_id} not found for this customer.")


class BenefitGrantRevoked(CustomerBenefitGrantError):
    def __init__(self, grant: BenefitGrant) -> None:
        self.grant = grant
        super().__init__("Cannot update a revoked benefit grant.")


class BenefitTypeMismatch(CustomerBenefitGrantError):
    def __init__(self, expected: str, given: str) -> None:
        self.expected = expected
        self.given = given
        super().__init__(
            "Benefit type must match the existing granted benefit type "
            f"(expected {expected!r}, got {given!r})."
        )


class OAuthAccountNotFound(CustomerBenefitGrantError):
    def __init__(self, account_id: str) -> None:
        self.account_id = account_id
        super().__init__(f"OAuth account {account_id!r} does not exist for this customer.")


@dataclass(frozen=True)
class BenefitGrantUpdate:
    """A customer-supplied update to a grant's strategy properties.

    ``benefit_type`` must match the grant's benefit (the same cross-check Polar enforces).
    ``oauth_account_id``, when present, re-targets an OAuth-backed grant (Discord, GitHub);
    it must resolve to an account the customer holds. ``properties`` is merged over the
    grant's existing properties.
    """

    benefit_type: str
    properties: dict[str, Any]
    oauth_account_id: str | None = None


class CustomerBenefitGrantRepository(Protocol):
    """Customer-scoped benefit-grant persistence (Polar's readable-grant statement)."""

    async def get_for_customer(
        self, customer_id: uuid.UUID, grant_id: uuid.UUID
    ) -> BenefitGrant | None: ...

    async def benefit_type_of(self, grant: BenefitGrant) -> str: ...

    async def save(self, grant: BenefitGrant) -> BenefitGrant: ...


class OAuthAccountResolver(Protocol):
    """Resolves whether a customer holds a given OAuth account (Polar's account lookup)."""

    async def has_account(
        self, customer_id: uuid.UUID, account_id: str
    ) -> bool: ...


class BenefitGrantHooks(Protocol):
    """Side-effect port: re-arm the grant engine after a property change (``benefit.update``)."""

    async def on_grant_updated(self, grant: BenefitGrant) -> None: ...


class CustomerBenefitGrantService:
    """Owned self-serve benefit-grant portal over the customer-scoped repository + ports."""

    async def update(
        self,
        repository: CustomerBenefitGrantRepository,
        oauth: OAuthAccountResolver,
        hooks: BenefitGrantHooks,
        *,
        customer_id: uuid.UUID,
        grant_id: uuid.UUID,
        update: BenefitGrantUpdate,
    ) -> BenefitGrant:
        """Reconfigure a customer's own benefit grant. Fused from Polar's ``update``.

        Rejects a revoked grant, a benefit-type mismatch, and (when re-targeting) an OAuth
        account the customer does not hold. On success, merges the new properties, clears
        the grant's prior error, and re-arms the grant engine through the hooks port.
        """
        grant = await self._require(repository, customer_id, grant_id)

        if grant.is_revoked:
            raise BenefitGrantRevoked(grant)

        actual_type = await repository.benefit_type_of(grant)
        if update.benefit_type != actual_type:
            raise BenefitTypeMismatch(actual_type, update.benefit_type)

        if update.oauth_account_id is not None:
            if not await oauth.has_account(customer_id, update.oauth_account_id):
                raise OAuthAccountNotFound(update.oauth_account_id)

        grant.properties = {**grant.properties, **update.properties}
        grant.error = None

        saved = await repository.save(grant)
        await hooks.on_grant_updated(saved)
        return saved

    async def _require(
        self,
        repository: CustomerBenefitGrantRepository,
        customer_id: uuid.UUID,
        grant_id: uuid.UUID,
    ) -> BenefitGrant:
        grant = await repository.get_for_customer(customer_id, grant_id)
        if grant is None:
            raise BenefitGrantNotFound(grant_id)
        return grant


customer_benefit_grant = CustomerBenefitGrantService()


__all__ = [
    "BenefitGrantHooks",
    "BenefitGrantNotFound",
    "BenefitGrantRevoked",
    "BenefitGrantUpdate",
    "BenefitTypeMismatch",
    "CustomerBenefitGrantError",
    "CustomerBenefitGrantRepository",
    "CustomerBenefitGrantService",
    "OAuthAccountNotFound",
    "OAuthAccountResolver",
    "customer_benefit_grant",
]
