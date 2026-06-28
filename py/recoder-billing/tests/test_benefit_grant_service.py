"""Tests for the benefit grant engine: grant/revoke state machine + strategy dispatch."""

import uuid

import pytest

from recoder_billing.entitlements.benefit.grant import (
    Benefit,
    BenefitActionRequiredError,
    BenefitStrategyRegistry,
    Customer,
)
from recoder_billing.entitlements.benefit.service import BenefitGrantService
from tests.memory_repositories import InMemoryBenefitGrantRepository

ORG = uuid.uuid4()


def _customer() -> Customer:
    return Customer(id=uuid.uuid4(), email="c@example.com", organization_id=ORG)


def _benefit(btype: str = "license_keys") -> Benefit:
    return Benefit(id=uuid.uuid4(), type=btype, organization_id=ORG)


class FakeStrategy:
    """A real (not mock) strategy that records the key it would issue in properties."""

    should_revoke_individually = True

    def __init__(self) -> None:
        self.granted = 0
        self.revoked = 0

    async def grant(self, benefit, customer, grant_properties, *, update=False, attempt=1):
        self.granted += 1
        return {**grant_properties, "license_key": "LK-VALUE"}

    async def revoke(self, benefit, customer, grant_properties, *, attempt=1):
        self.revoked += 1
        return {}

    async def requires_update(self, benefit, previous_properties):
        return False


class ActionRequiredStrategy:
    should_revoke_individually = True

    async def grant(self, benefit, customer, grant_properties, *, update=False, attempt=1):
        raise BenefitActionRequiredError("connect account", grant_properties={"step": "oauth"})

    async def revoke(self, benefit, customer, grant_properties, *, attempt=1):
        return {}

    async def requires_update(self, benefit, previous_properties):
        return False


def _build(strategy, btype="license_keys"):
    repo = InMemoryBenefitGrantRepository()
    registry = BenefitStrategyRegistry()
    registry.register(btype, strategy)
    return BenefitGrantService(repo, registry), repo


@pytest.mark.asyncio
@pytest.mark.unit
async def test_grant_benefit_materializes_properties():
    strategy = FakeStrategy()
    service, _ = _build(strategy)
    benefit, customer = _benefit(), _customer()

    grant = await service.grant_benefit(customer, benefit)
    assert grant.is_granted
    assert grant.properties["license_key"] == "LK-VALUE"
    assert strategy.granted == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_grant_is_idempotent():
    strategy = FakeStrategy()
    service, _ = _build(strategy)
    benefit, customer = _benefit(), _customer()

    first = await service.grant_benefit(customer, benefit)
    second = await service.grant_benefit(customer, benefit)
    assert first.id == second.id
    # Strategy not invoked again once already granted.
    assert strategy.granted == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_grant_action_required_records_failure_not_success():
    service, _ = _build(ActionRequiredStrategy())
    benefit, customer = _benefit(), _customer()

    grant = await service.grant_benefit(customer, benefit)
    assert not grant.is_granted
    assert grant.error is not None
    assert grant.error["type"] == "BenefitActionRequiredError"
    assert grant.properties == {"step": "oauth"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_revoke_benefit():
    strategy = FakeStrategy()
    service, _ = _build(strategy)
    benefit, customer = _benefit(), _customer()

    await service.grant_benefit(customer, benefit)
    revoked = await service.revoke_benefit(customer, benefit)
    assert revoked.is_revoked
    assert not revoked.is_granted
    assert strategy.revoked == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_revoke_is_idempotent():
    strategy = FakeStrategy()
    service, _ = _build(strategy)
    benefit, customer = _benefit(), _customer()

    await service.grant_benefit(customer, benefit)
    await service.revoke_benefit(customer, benefit)
    again = await service.revoke_benefit(customer, benefit)
    assert again.is_revoked
    # revoke strategy runs only once.
    assert strategy.revoked == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_unknown_benefit_type_raises():
    service, _ = _build(FakeStrategy(), btype="license_keys")
    with pytest.raises(ValueError):
        await service.grant_benefit(_customer(), _benefit("downloadables"))
