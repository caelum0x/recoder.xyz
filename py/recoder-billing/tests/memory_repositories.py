"""In-memory repository implementations for exercising the entitlement spine in tests.

These are REAL repositories (not mocks): they store dataclass records and answer the
same queries the Postgres implementation will. They satisfy the service Protocols so the
fused algorithms run end-to-end without a database.
"""

from __future__ import annotations

import uuid

from recoder_billing.entitlements.benefit.grant import Benefit, Customer
from recoder_billing.models.benefit_grant import BenefitGrant, BenefitGrantScope
from recoder_billing.models.checkout import Checkout
from recoder_billing.models.license_key import LicenseKey, LicenseKeyActivation
from recoder_billing.models.order import Order
from recoder_billing.models.product import Product
from recoder_billing.models.subscription import Subscription


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


class InMemoryCheckoutRepository:
    """Real checkout store satisfying the CheckoutRepository port."""

    def __init__(self) -> None:
        self.checkouts: dict[uuid.UUID, Checkout] = {}

    async def get(self, checkout_id: uuid.UUID) -> Checkout | None:
        return self.checkouts.get(checkout_id)

    async def save(self, checkout: Checkout) -> Checkout:
        self.checkouts[checkout.id] = checkout
        return checkout


class InMemoryProductLookup:
    """Real product lookup callable, satisfying the operations product_lookup port."""

    def __init__(self) -> None:
        self.products: dict[uuid.UUID, Product] = {}

    def add(self, product: Product) -> Product:
        self.products[product.id] = product
        return product

    async def __call__(self, product_id: uuid.UUID) -> Product | None:
        return self.products.get(product_id)


class InMemoryOrderRepository:
    """Real order store satisfying the OrderRepository port."""

    def __init__(self) -> None:
        self.orders: dict[uuid.UUID, Order] = {}

    async def get(self, order_id: uuid.UUID) -> Order | None:
        return self.orders.get(order_id)

    async def save(self, order: Order) -> Order:
        self.orders[order.id] = order
        return order


class InMemorySubscriptionRepository:
    """Real subscription store satisfying the SubscriptionRepository port."""

    def __init__(self) -> None:
        self.subscriptions: dict[uuid.UUID, Subscription] = {}

    async def get(self, subscription_id: uuid.UUID) -> Subscription | None:
        return self.subscriptions.get(subscription_id)

    async def save(self, subscription: Subscription) -> Subscription:
        self.subscriptions[subscription.id] = subscription
        return subscription


class RecordingLifecycleHooks:
    """Real (recording) lifecycle hooks satisfying the LifecycleHooks port."""

    def __init__(self) -> None:
        self.canceled: list[bool] = []
        self.uncanceled = 0
        self.revoked = 0
        self.past_due = 0
        self.activated = 0

    async def on_canceled(self, subscription, *, immediately: bool) -> None:
        self.canceled.append(immediately)

    async def on_uncanceled(self, subscription) -> None:
        self.uncanceled += 1

    async def on_revoked(self, subscription) -> None:
        self.revoked += 1

    async def on_past_due(self, subscription) -> None:
        self.past_due += 1

    async def on_activated(self, subscription) -> None:
        self.activated += 1
