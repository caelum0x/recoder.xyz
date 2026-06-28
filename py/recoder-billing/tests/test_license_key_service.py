"""Tests for the license-key service: issue -> validate -> activate -> deactivate."""

import uuid

import pytest

from recoder_billing.entitlements.exceptions import (
    BadRequest,
    NotPermitted,
    ResourceNotFound,
)
from recoder_billing.entitlements.license_key.service import (
    LicenseKeyActivateRequest,
    LicenseKeyDeactivateRequest,
    LicenseKeyService,
    LicenseKeyValidateRequest,
    generate_expiration_dt,
    generate_key,
)
from recoder_billing.kit.utils import utc_now
from tests.memory_repositories import InMemoryLicenseKeyRepository

ORG = uuid.uuid4()
CUSTOMER = uuid.uuid4()
BENEFIT = uuid.uuid4()


@pytest.fixture
def service() -> LicenseKeyService:
    return LicenseKeyService(InMemoryLicenseKeyRepository())


@pytest.mark.unit
def test_generate_key_with_and_without_prefix():
    assert "-" in generate_key()  # uuid contains dashes
    prefixed = generate_key(prefix="rec")
    assert prefixed.startswith("REC-")


@pytest.mark.unit
def test_generate_expiration_dt_future():
    assert generate_expiration_dt(1, "year") > utc_now()
    assert generate_expiration_dt(1, "month") > utc_now()
    assert generate_expiration_dt(1, "day") > utc_now()


@pytest.mark.unit
def test_generate_expiration_month_clamps_day():
    # Jan 31 + 1 month must clamp to Feb's last day, not raise.
    from datetime import datetime, timezone

    from recoder_billing.entitlements.license_key import service as svc

    jan31 = datetime(2025, 1, 31, tzinfo=timezone.utc)
    result = svc._add_relative(jan31, 1, "month")
    assert result.month == 2
    assert result.day == 28


@pytest.mark.asyncio
@pytest.mark.unit
async def test_issue_then_validate(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG, customer_id=CUSTOMER, benefit_id=BENEFIT
    )
    assert lk.is_active()
    assert lk.validations == 0

    validated = await service.validate(
        LicenseKeyValidateRequest(key=lk.key, organization_id=ORG)
    )
    assert validated.validations == 1
    assert validated.last_validated_at is not None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_unknown_key_raises_not_found(service: LicenseKeyService):
    with pytest.raises(ResourceNotFound):
        await service.validate(
            LicenseKeyValidateRequest(key="NOPE", organization_id=ORG)
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_revoked_key_denied(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG, customer_id=CUSTOMER, benefit_id=BENEFIT
    )
    await service.revoke(lk)
    with pytest.raises(ResourceNotFound):
        await service.validate(
            LicenseKeyValidateRequest(key=lk.key, organization_id=ORG)
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_usage_limit_enforced(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG,
        customer_id=CUSTOMER,
        benefit_id=BENEFIT,
        limit_usage=2,
    )
    await service.validate(
        LicenseKeyValidateRequest(
            key=lk.key, organization_id=ORG, increment_usage=2
        )
    )
    # Now 0 remaining; requesting 1 more must raise.
    with pytest.raises(BadRequest):
        await service.validate(
            LicenseKeyValidateRequest(
                key=lk.key, organization_id=ORG, increment_usage=1
            )
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_validate_benefit_and_customer_mismatch(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG, customer_id=CUSTOMER, benefit_id=BENEFIT
    )
    with pytest.raises(ResourceNotFound):
        await service.validate(
            LicenseKeyValidateRequest(
                key=lk.key, organization_id=ORG, benefit_id=uuid.uuid4()
            )
        )
    with pytest.raises(ResourceNotFound):
        await service.validate(
            LicenseKeyValidateRequest(
                key=lk.key, organization_id=ORG, customer_id=uuid.uuid4()
            )
        )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_activate_and_deactivate(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG,
        customer_id=CUSTOMER,
        benefit_id=BENEFIT,
        limit_activations=1,
    )
    activation = await service.activate(
        LicenseKeyActivateRequest(key=lk.key, organization_id=ORG, label="laptop")
    )
    assert activation.label == "laptop"

    # Second activation exceeds the limit.
    with pytest.raises(NotPermitted):
        await service.activate(
            LicenseKeyActivateRequest(key=lk.key, organization_id=ORG, label="phone")
        )

    # Deactivate frees a slot, then re-activation succeeds.
    ok = await service.deactivate(
        LicenseKeyDeactivateRequest(
            key=lk.key, organization_id=ORG, activation_id=activation.id
        )
    )
    assert ok is True
    again = await service.activate(
        LicenseKeyActivateRequest(key=lk.key, organization_id=ORG, label="phone")
    )
    assert again.label == "phone"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_activate_without_activation_support_denied(service: LicenseKeyService):
    lk = await service.issue(
        organization_id=ORG, customer_id=CUSTOMER, benefit_id=BENEFIT
    )  # no limit_activations
    with pytest.raises(NotPermitted):
        await service.activate(
            LicenseKeyActivateRequest(key=lk.key, organization_id=ORG, label="x")
        )
