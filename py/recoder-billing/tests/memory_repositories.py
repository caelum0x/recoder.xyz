"""In-memory repository implementations for exercising the entitlement spine in tests.

These are REAL repositories (not mocks): they store dataclass records and answer the
same queries the Postgres implementation will. They satisfy the service Protocols so the
fused algorithms run end-to-end without a database.
"""

from __future__ import annotations

import uuid

from recoder_billing.entitlements.benefit.grant import Benefit, Customer
from recoder_billing.models.benefit_grant import BenefitGrant, BenefitGrantScope
from recoder_billing.models.license_key import LicenseKey, LicenseKeyActivation


class InMemoryLicenseKeyRepository:
    def __init__(self) -> None:
        self.keys: dict[uuid.UUID, LicenseKey] = {}
        self.activations: dict[uuid.UUID, LicenseKeyActivation] = {}

    async def get_by_organization_and_key(
        self, organization_id: uuid.UUID, key: str
    ) -> LicenseKey | None:
        for lk in self.keys.values():
            if lk.organization_id == organization_id and lk.key == key:
                return lk
        return None

    async def add(self, license_key: LicenseKey) -> LicenseKey:
        self.keys[license_key.id] = license_key
        return license_key

    async def update(self, license_key: LicenseKey) -> LicenseKey:
        self.keys[license_key.id] = license_key
        return license_key

    async def get_activation(
        self, license_key_id: uuid.UUID, activation_id: uuid.UUID
    ) -> LicenseKeyActivation | None:
        activation = self.activations.get(activation_id)
        if activation is None or activation.license_key_id != license_key_id:
            return None
        return activation

    async def add_activation(
        self, activation: LicenseKeyActivation
    ) -> LicenseKeyActivation:
        self.activations[activation.id] = activation
        return activation

    async def update_activation(
        self, activation: LicenseKeyActivation
    ) -> LicenseKeyActivation:
        self.activations[activation.id] = activation
        return activation

    async def count_active_activations(self, license_key_id: uuid.UUID) -> int:
        return sum(
            1
            for a in self.activations.values()
            if a.license_key_id == license_key_id and not a.is_deleted
        )


def _scope_matches(grant: BenefitGrant, scope: BenefitGrantScope) -> bool:
    return (
        grant.subscription_id == scope.get("subscription_id")
        and grant.order_id == scope.get("order_id")
    )


class InMemoryBenefitGrantRepository:
    def __init__(self) -> None:
        self.grants: dict[uuid.UUID, BenefitGrant] = {}

    async def get_by_benefit_and_scope(
        self,
        customer: Customer,
        benefit: Benefit,
        *,
        member_id: uuid.UUID | None = None,
        scope: BenefitGrantScope,
    ) -> BenefitGrant | None:
        for grant in self.grants.values():
            if grant.is_deleted:
                continue
            if (
                grant.customer_id == customer.id
                and grant.benefit_id == benefit.id
                and grant.member_id == member_id
                and _scope_matches(grant, scope)
            ):
                return grant
        return None

    async def add(self, grant: BenefitGrant) -> BenefitGrant:
        self.grants[grant.id] = grant
        return grant

    async def update(self, grant: BenefitGrant) -> BenefitGrant:
        self.grants[grant.id] = grant
        return grant

    async def list_granted_by_benefit_and_customer(
        self, benefit: Benefit, customer: Customer
    ) -> list[BenefitGrant]:
        return [
            g
            for g in self.grants.values()
            if g.benefit_id == benefit.id
            and g.customer_id == customer.id
            and g.is_granted
        ]
