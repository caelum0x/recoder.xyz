"""Benefit grant strategy contract + registry. Fused from polar/benefit/strategies + registry.

A *benefit* is something a customer gets when they pay (a license key, a download, a
feature flag). A *strategy* knows how to materialize/revoke one benefit type. The grant
engine (see service.py) drives strategies through the grant/revoke state machine.

Upstream couples strategies to SQLAlchemy sessions + Redis; here the strategy contract is
storage-agnostic so the grant spine is real and testable. Concrete per-benefit strategies
(license_keys, downloadables, feature_flag, meter_credit) land alongside their richer
dependencies in the follow-up fusion.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

BenefitProperties = dict[str, Any]
BenefitGrantProperties = dict[str, Any]


class BenefitGrantError(Exception):
    """Base for benefit-grant strategy errors."""


class BenefitRetriableError(BenefitGrantError):
    """A transient failure; the grant should be retried by the worker."""

    def __init__(self, message: str, defer_seconds: int | None = None) -> None:
        super().__init__(message)
        self.defer_seconds = defer_seconds


class BenefitActionRequiredError(BenefitGrantError):
    """The customer must take an action (e.g. connect an account) before the grant completes.

    Carries optional partial ``grant_properties`` to persist so the action can resume.
    """

    def __init__(
        self, message: str, grant_properties: BenefitGrantProperties | None = None
    ) -> None:
        super().__init__(message)
        self.grant_properties = grant_properties


@dataclass(frozen=True)
class Customer:
    """The minimal customer shape a strategy needs. Mirrors polar.models.Customer."""

    id: uuid.UUID
    email: str
    organization_id: uuid.UUID


@dataclass(frozen=True)
class Benefit:
    """The minimal benefit shape a strategy needs. Mirrors polar.models.Benefit."""

    id: uuid.UUID
    type: str
    organization_id: uuid.UUID
    properties: BenefitProperties = field(default_factory=dict)


class BenefitStrategy(Protocol):
    """How a single benefit type is materialized and revoked.

    ``should_revoke_individually`` mirrors upstream: when False, a benefit shared across
    multiple purchases is only revoked once the last grant goes away.
    """

    should_revoke_individually: bool

    async def grant(
        self,
        benefit: Benefit,
        customer: Customer,
        grant_properties: BenefitGrantProperties,
        *,
        update: bool = False,
        attempt: int = 1,
    ) -> BenefitGrantProperties: ...

    async def revoke(
        self,
        benefit: Benefit,
        customer: Customer,
        grant_properties: BenefitGrantProperties,
        *,
        attempt: int = 1,
    ) -> BenefitGrantProperties: ...

    async def requires_update(
        self, benefit: Benefit, previous_properties: BenefitProperties
    ) -> bool: ...


class BenefitStrategyRegistry:
    """Maps a benefit ``type`` string to its strategy. Fused from polar/benefit/registry.py."""

    def __init__(self) -> None:
        self._strategies: dict[str, BenefitStrategy] = {}

    def register(self, benefit_type: str, strategy: BenefitStrategy) -> None:
        if benefit_type in self._strategies:
            raise ValueError(f"Strategy already registered for benefit type '{benefit_type}'.")
        self._strategies[benefit_type] = strategy

    def get(self, benefit_type: str) -> BenefitStrategy:
        try:
            return self._strategies[benefit_type]
        except KeyError as e:
            raise ValueError(
                f"No benefit strategy registered for type '{benefit_type}'."
            ) from e

    def is_registered(self, benefit_type: str) -> bool:
        return benefit_type in self._strategies
