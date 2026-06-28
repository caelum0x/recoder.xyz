"""Payout lifecycle. Fused from polar/payout/service.py (+ polar/account), owned by Recoder.

Polar's ``PayoutService`` is welded to SQLAlchemy, a Redis lock, the platform-fee
transaction ledger, the worker, and the Stripe Connect SDK. The *owned* spine — the
state machine that decides whether funds move, how much, and to where — is small and
self-contained:

- ``create``: gate on the account's payout eligibility (review state, minimum balance,
  payout-interval), then open the payout in ``pending`` or ``held`` and emit the
  transfer side effect (skipped while held).
- ``transfer``: the processor-agnostic guard before money moves — re-check payability
  and the payout-account pin (a swapped payout account is canceled, not transferred),
  then dispatch the Stripe Connect transfer through the processor port.
- ``trigger``: once the Connect account's balance is available, create a payout attempt
  and trigger the actual Stripe payout through the port.
- ``cancel`` / ``release_held``: reverse a payout, or release every held payout for an
  account once its organization is approved.
- ``sync_from_provider``: fold a provider status (webhook or poll) into the latest
  attempt.

The two Stripe Connect IO boundaries Polar inlined — the *transfer to* the Connect
account and the *payout from* it, plus balance retrieval and transfer reversal — are
pushed behind :class:`PayoutProcessorPort`. Persistence is :class:`PayoutRepository`,
fee math is :class:`FeeCalculator`, and a single-flight guard is :class:`PayoutLocker`.
All are host-supplied — no in-package fake — so the lifecycle compiles and is testable
without SQLAlchemy, Redis, or the Stripe SDK.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from ...kit.currency import format_currency
from ...kit.utils import generate_uuid, utc_now
from .account import AccountStatus, PayoutAccount, PayoutProcessorType


class PayoutStatus(StrEnum):
    pending = "pending"
    held = "held"
    in_transit = "in_transit"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"

    @classmethod
    def cancelable_statuses(cls) -> set["PayoutStatus"]:
        return {cls.pending, cls.held}

    def is_cancelable(self) -> bool:
        return self in PayoutStatus.cancelable_statuses()

    def is_payable(self) -> bool:
        """Whether a transfer may still be attempted for a payout in this status."""
        return self not in {self.canceled, self.held, self.succeeded}


class PayoutAttemptStatus(StrEnum):
    pending = "pending"
    in_transit = "in_transit"
    succeeded = "succeeded"
    failed = "failed"

    @classmethod
    def from_provider(cls, status: str) -> "PayoutAttemptStatus":
        """Map a processor payout status onto the owned attempt taxonomy.

        Fused from Polar's ``PayoutAttemptStatus.from_stripe``: Stripe reports
        ``paid`` / ``in_transit`` / ``pending`` / ``failed`` / ``canceled``.
        """
        match status:
            case "paid":
                return cls.succeeded
            case "in_transit":
                return cls.in_transit
            case "failed" | "canceled":
                return cls.failed
            case _:
                return cls.pending


@dataclass
class PayoutAttempt:
    """One attempt to settle a payout through the processor."""

    payout_id: uuid.UUID
    processor: PayoutProcessorType
    amount: int  # minor units, in the account currency
    currency: str
    status: PayoutAttemptStatus = PayoutAttemptStatus.pending

    processor_id: str | None = None
    failed_reason: str | None = None
    paid_at: datetime | None = None

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Payout:
    """A payout of an account's available balance. Canonical shape + transfer linkage."""

    account_id: uuid.UUID
    payout_account_id: uuid.UUID
    processor: PayoutProcessorType

    currency: str  # platform currency (e.g. "usd")
    amount: int  # gross minor units in the platform currency
    fees_amount: int  # platform + processor fees withheld
    account_currency: str  # the connected account's settlement currency
    account_amount: int  # net minor units in the account currency

    status: PayoutStatus = PayoutStatus.pending
    transfer_id: str | None = None  # the processor transfer id (step 1)
    invoice_number: str | None = None
    invoice_path: str | None = None

    attempts: list[PayoutAttempt] = field(default_factory=list)

    id: uuid.UUID = field(default_factory=generate_uuid)
    created_at: datetime = field(default_factory=utc_now)

    @property
    def is_invoice_generated(self) -> bool:
        return self.invoice_path is not None

    @property
    def latest_syncable_attempt(self) -> PayoutAttempt | None:
        """The most recent attempt that carries a processor id, if any."""
        for attempt in reversed(self.attempts):
            if attempt.processor_id is not None:
                return attempt
        return None


class PayoutError(Exception):
    """Base error for payout operations."""


class OrganizationCannotPayout(PayoutError):
    def __init__(self, account: PayoutAccount) -> None:
        self.account = account
        match account.status:
            case AccountStatus.created | AccountStatus.onboarding_started:
                message = (
                    "Your organization isn't active yet. "
                    "Payouts will be available once it's approved."
                )
            case AccountStatus.denied:
                message = (
                    "Your organization's review was denied, "
                    "so payouts aren't available."
                )
            case AccountStatus.offboarding:
                message = (
                    "Your organization is being offboarded, "
                    "so payouts aren't available."
                )
            case AccountStatus.blocked:
                message = "Your organization is blocked, so payouts aren't available."
            case _:
                message = "Your organization can't request a payout at the moment."
        super().__init__(message)


class InsufficientBalance(PayoutError):
    def __init__(
        self, account: PayoutAccount, balance: int, *, minimum_amount: int | None = None
    ) -> None:
        self.account = account
        self.balance = balance
        message = "You have an insufficient balance to make a payout."
        if minimum_amount is not None:
            message += (
                f" The minimum withdrawal amount is "
                f"{format_currency(minimum_amount, 'usd')}."
            )
        super().__init__(message)


class PendingPayoutCreation(PayoutError):
    def __init__(self, account: PayoutAccount) -> None:
        self.account = account
        super().__init__(
            f"A payout is already being created for the account {account.id}."
        )


class PayoutIntervalLimitReached(PayoutError):
    def __init__(self, account: PayoutAccount, next_payout_at: datetime) -> None:
        self.account = account
        self.next_payout_at = next_payout_at
        super().__init__(
            "A payout was requested too recently; "
            f"the next one is available at {next_payout_at.isoformat()}."
        )


class PayoutNotCancelable(PayoutError):
    def __init__(self, payout: Payout) -> None:
        self.payout = payout
        super().__init__(
            f"Payout {payout.id} cannot be canceled because of its current status."
        )


class PayoutCanceled(PayoutError):
    def __init__(self, payout: Payout) -> None:
        self.payout = payout
        super().__init__(
            f"Payout {payout.id} has been canceled and cannot be retried."
        )


class PayoutAccountInsufficientBalance(PayoutError):
    def __init__(self, payout: Payout) -> None:
        self.payout = payout
        super().__init__(
            f"The payout account for payout {payout.id} doesn't have enough "
            "balance to make the payout yet."
        )


class NoSyncableAttempt(PayoutError):
    def __init__(self, payout: Payout) -> None:
        self.payout = payout
        super().__init__(
            f"Payout {payout.id} has no attempt with a provider id that can be synced."
        )


@dataclass(frozen=True)
class TransferResult:
    """The processor's result of transferring funds to a connected account (step 1)."""

    transfer_id: str
    account_amount: int  # the converted net amount in the account currency


@dataclass(frozen=True)
class ProviderPayoutResult:
    """The processor's result of triggering a payout from a connected account (step 2)."""

    processor_id: str | None
    succeeded: bool
    error: str | None = None


@dataclass(frozen=True)
class ProviderPayoutState:
    """A provider's reported payout state, folded into an attempt by ``sync_from_provider``."""

    processor_id: str
    status: str  # raw provider status (mapped via PayoutAttemptStatus.from_provider)
    failure_reason: str | None = None
    arrival_at: datetime | None = None


class PayoutProcessorPort(Protocol):
    """Port for the Stripe Connect transfer/payout IO (the host implements with the SDK).

    Polar inlined ``stripe_service.transfer`` / ``create_payout`` / ``retrieve_balance``
    / ``reverse_transfer`` directly into the payout service. We push those four IO
    boundaries behind this port so the owned payout state machine is exercisable without
    the Stripe SDK.
    """

    async def transfer(
        self,
        *,
        payout: Payout,
        payout_account: PayoutAccount,
        idempotency_key: str,
    ) -> TransferResult: ...

    async def retrieve_balance(self, payout_account: PayoutAccount) -> int: ...

    async def create_payout(
        self,
        *,
        payout: Payout,
        payout_account: PayoutAccount,
        amount: int,
        idempotency_key: str,
    ) -> ProviderPayoutResult: ...

    async def reverse_transfer(
        self, *, payout: Payout, transfer_id: str
    ) -> str: ...


class FeeCalculator(Protocol):
    """Port computing the platform + processor fees withheld from a payout.

    Polar's ``platform_fee_transaction_service`` derives these from the account's fee
    config and the per-payout ledger. Returns the net amount paid out after fees.
    """

    async def net_after_fees(
        self, *, account: PayoutAccount, balance_amount: int
    ) -> int: ...


class PayoutRepository(Protocol):
    """Durable persistence port for payouts (satisfied by the host's DB layer)."""

    async def get(self, payout_id: uuid.UUID) -> Payout | None: ...

    async def save(self, payout: Payout) -> Payout: ...

    async def get_account_balance(self, account: PayoutAccount) -> int: ...

    async def get_latest_payout_created_at(
        self, account: PayoutAccount
    ) -> datetime | None: ...

    async def get_current_payout_account_id(
        self, account_id: uuid.UUID
    ) -> uuid.UUID | None: ...

    async def get_held_payouts(self, account_id: uuid.UUID) -> list[Payout]: ...


class PayoutLocker(Protocol):
    """Single-flight guard so only one payout is created per account at a time.

    Polar used a Redis lock (``payout:{account_id}``). The host supplies the real lock;
    the contract is just "is another creation in flight, and run this under the lock".
    """

    async def is_locked(self, key: str) -> bool: ...

    def lock(self, key: str) -> "PayoutLockHandle": ...


class PayoutLockHandle(Protocol):
    """An async context manager handle returned by :meth:`PayoutLocker.lock`."""

    async def __aenter__(self) -> "PayoutLockHandle": ...

    async def __aexit__(self, *exc: object) -> None: ...


class PayoutHooks(Protocol):
    """Side-effect port for payout lifecycle (Polar enqueued worker jobs)."""

    async def on_created(self, payout: Payout) -> None: ...

    async def on_transfer_requested(self, payout: Payout) -> None: ...


# Default minimum withdrawal in the platform currency (minor units). Polar reads this
# per account currency/country from settings; the host may override via ``minimum_amount``.
DEFAULT_MINIMUM_PAYOUT = 1000


class PayoutService:
    """Owned payout lifecycle over repository + processor + fee + lock + hooks ports."""

    async def create(
        self,
        repository: PayoutRepository,
        fees: FeeCalculator,
        locker: PayoutLocker,
        hooks: PayoutHooks,
        account: PayoutAccount,
        *,
        minimum_amount: int = DEFAULT_MINIMUM_PAYOUT,
    ) -> Payout:
        """Open a payout for an account's available balance. Fused from Polar's ``create``.

        Gates, in order: the single-flight lock, payout eligibility (review state),
        the payout-interval, and the minimum balance. The payout is opened ``held`` for
        a REVIEW/SNOOZED organization (transfer deferred until approval) or ``pending``
        otherwise, with the transfer side effect emitted for the latter.
        """
        lock_name = f"payout:{account.id}"
        if await locker.is_locked(lock_name):
            raise PendingPayoutCreation(account)

        async with locker.lock(lock_name):
            if not account.can_payout:
                raise OrganizationCannotPayout(account)

            last_created_at = await repository.get_latest_payout_created_at(account)
            next_payout_at = account.next_payout_at(last_created_at)
            if next_payout_at is not None:
                raise PayoutIntervalLimitReached(account, next_payout_at)

            balance_amount = await repository.get_account_balance(account)
            if balance_amount < minimum_amount:
                raise InsufficientBalance(
                    account, balance_amount, minimum_amount=minimum_amount
                )

            net_amount = await fees.net_after_fees(
                account=account, balance_amount=balance_amount
            )
            if net_amount <= 0:
                raise InsufficientBalance(account, balance_amount)

            held = account.held
            payout = Payout(
                account_id=account.id,
                payout_account_id=account.id,
                processor=account.processor,
                currency="usd",
                amount=net_amount,
                fees_amount=balance_amount - net_amount,
                account_currency=account.currency,
                account_amount=net_amount,
                status=PayoutStatus.held if held else PayoutStatus.pending,
            )
            saved = await repository.save(payout)

            await hooks.on_created(saved)
            if not held:
                await hooks.on_transfer_requested(saved)
            return saved

    async def transfer(
        self,
        repository: PayoutRepository,
        processor: PayoutProcessorPort,
        payout_id: uuid.UUID,
        account: PayoutAccount,
    ) -> Payout:
        """Transfer funds to the connected account (step 1). Processor-agnostic guards.

        Fuses Polar's ``transfer``: skip a payout that is no longer payable; if the
        organization swapped its payout account since this payout was pinned, cancel
        rather than send funds to the abandoned account; otherwise run the Stripe
        Connect transfer through the port and record the converted account amount.
        """
        payout = await self._require(repository, payout_id)

        if not payout.status.is_payable():
            return payout

        # The payout pins the payout account it was created against. If the org has
        # since swapped accounts, transferring would send funds to the abandoned one.
        if payout.transfer_id is None:
            current = await repository.get_current_payout_account_id(payout.account_id)
            if current is not None and current != payout.payout_account_id:
                return await self.cancel(repository, processor, payout.id)

        result = await processor.transfer(
            payout=payout,
            payout_account=account,
            idempotency_key=f"payout-{payout.id}",
        )
        payout.transfer_id = result.transfer_id
        payout.account_amount = result.account_amount
        payout.status = PayoutStatus.in_transit
        return await repository.save(payout)

    async def trigger(
        self,
        repository: PayoutRepository,
        processor: PayoutProcessorPort,
        payout_id: uuid.UUID,
        account: PayoutAccount,
        *,
        account_amount: int | None = None,
    ) -> PayoutAttempt:
        """Trigger the payout from the connected account (step 2). Fused from Polar.

        Requires the Connect account's balance to cover the amount, creates a pending
        attempt, then triggers the Stripe payout through the port. A processor rejection
        is recorded as a failed attempt (Polar deliberately does not raise — Stripe has
        many hidden payout rules) rather than aborting the whole flow.
        """
        payout = await self._require(repository, payout_id)
        if payout.status == PayoutStatus.canceled:
            raise PayoutCanceled(payout)

        amount = account_amount if account_amount is not None else payout.account_amount

        balance = await processor.retrieve_balance(account)
        if balance < amount:
            raise PayoutAccountInsufficientBalance(payout)

        attempt = PayoutAttempt(
            payout_id=payout.id,
            processor=account.processor,
            amount=amount,
            currency=payout.account_currency,
            status=PayoutAttemptStatus.pending,
        )
        payout.attempts.append(attempt)

        result = await processor.create_payout(
            payout=payout,
            payout_account=account,
            amount=amount,
            idempotency_key=f"payout-trigger-{attempt.id}",
        )
        if not result.succeeded or result.processor_id is None:
            attempt.status = PayoutAttemptStatus.failed
            attempt.failed_reason = result.error or "Provider rejected the payout."
        else:
            attempt.processor_id = result.processor_id
            attempt.status = PayoutAttemptStatus.in_transit

        await repository.save(payout)
        return attempt

    async def cancel(
        self,
        repository: PayoutRepository,
        processor: PayoutProcessorPort,
        payout_id: uuid.UUID,
    ) -> Payout:
        """Cancel a payout, reversing the transfer if one already ran. Fused from Polar.

        Only ``pending`` / ``held`` payouts are cancelable. When a transfer was already
        made, the funds are reversed through the processor; otherwise the per-payout fees
        were only reserved and the cancel simply finalizes the status.
        """
        payout = await self._require(repository, payout_id)
        if not payout.status.is_cancelable():
            raise PayoutNotCancelable(payout)

        if (
            payout.processor == PayoutProcessorType.stripe
            and payout.transfer_id is not None
        ):
            await processor.reverse_transfer(
                payout=payout, transfer_id=payout.transfer_id
            )

        payout.status = PayoutStatus.canceled
        return await repository.save(payout)

    async def release_held(
        self,
        repository: PayoutRepository,
        hooks: PayoutHooks,
        account_id: uuid.UUID,
    ) -> list[Payout]:
        """Release every held payout for an account once its org is approved.

        Fuses Polar's ``release_held_payouts``: each held payout returns to ``pending``
        and re-emits the transfer side effect that was skipped while it was held.
        """
        released: list[Payout] = []
        for payout in await repository.get_held_payouts(account_id):
            if payout.status != PayoutStatus.held:
                continue
            payout.status = PayoutStatus.pending
            saved = await repository.save(payout)
            await hooks.on_transfer_requested(saved)
            released.append(saved)
        return released

    async def sync_from_provider(
        self,
        repository: PayoutRepository,
        payout_id: uuid.UUID,
        state: ProviderPayoutState,
    ) -> PayoutAttempt:
        """Fold a provider payout state (webhook or poll) into the latest attempt.

        Fuses Polar's ``update_from_stripe`` / ``sync_with_provider``: match the attempt
        carrying the provider id, map the provider status onto the attempt taxonomy, and
        record the failure reason or arrival time. The owning payout's status follows.
        """
        payout = await self._require(repository, payout_id)
        attempt = self._match_attempt(payout, state.processor_id)
        if attempt is None:
            raise NoSyncableAttempt(payout)

        attempt.status = PayoutAttemptStatus.from_provider(state.status)
        if attempt.status == PayoutAttemptStatus.failed:
            attempt.failed_reason = state.failure_reason
            payout.status = PayoutStatus.failed
        elif attempt.status == PayoutAttemptStatus.succeeded:
            attempt.paid_at = state.arrival_at or utc_now()
            payout.status = PayoutStatus.succeeded
        elif attempt.status == PayoutAttemptStatus.in_transit:
            payout.status = PayoutStatus.in_transit

        await repository.save(payout)
        return attempt

    def _match_attempt(
        self, payout: Payout, processor_id: str
    ) -> PayoutAttempt | None:
        for attempt in reversed(payout.attempts):
            if attempt.processor_id == processor_id:
                return attempt
        return None

    async def _require(
        self, repository: PayoutRepository, payout_id: uuid.UUID
    ) -> Payout:
        payout = await repository.get(payout_id)
        if payout is None:
            raise PayoutError(f"Payout {payout_id} does not exist.")
        return payout


payout = PayoutService()


__all__ = [
    "DEFAULT_MINIMUM_PAYOUT",
    "FeeCalculator",
    "InsufficientBalance",
    "NoSyncableAttempt",
    "OrganizationCannotPayout",
    "Payout",
    "PayoutAccountInsufficientBalance",
    "PayoutAttempt",
    "PayoutAttemptStatus",
    "PayoutCanceled",
    "PayoutError",
    "PayoutHooks",
    "PayoutIntervalLimitReached",
    "PayoutLockHandle",
    "PayoutLocker",
    "PayoutNotCancelable",
    "PayoutProcessorPort",
    "PayoutRepository",
    "PayoutService",
    "PayoutStatus",
    "PendingPayoutCreation",
    "ProviderPayoutResult",
    "ProviderPayoutState",
    "TransferResult",
    "payout",
]
