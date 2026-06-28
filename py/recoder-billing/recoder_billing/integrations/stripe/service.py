"""Stripe SDK wrapper. Fused from polar/integrations/stripe/service.py, owned by Recoder.

Polar's ``StripeService`` is a thin async wrapper over the ``stripe`` SDK, configured at
import time from settings. In the owned spine the SDK is an *optional* dependency that
lives strictly behind the processor adapter boundary: this module imports ``stripe``
lazily (install the 'stripe' extra) so the billing spine itself AST-compiles and imports
without the SDK present, and the adapter only reaches for it when a real charge/payout
actually runs.

The class keeps only the operations the owned checkout + payout flows need — payment
intent confirmation, refunds, Connect transfer / payout / balance / reversal — plus
account/customer helpers. Configuration (API key, version) is supplied by the host
:class:`StripeConfig`, never read from a global at import time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


def _require_stripe() -> Any:
    """Import the ``stripe`` SDK lazily, with a clear install hint when absent.

    Polar bound ``import stripe`` at module top and configured the global API key on
    import. We defer the import to first use so the owned spine compiles and imports
    standalone; the host installs the 'stripe' extra to actually talk to Stripe.
    """
    try:
        import stripe as stripe_lib  # type: ignore

        return stripe_lib
    except ImportError as e:  # pragma: no cover - exercised only without the SDK
        raise RuntimeError(
            "The 'stripe' SDK is required for the Stripe processor adapter. "
            "Install the 'stripe' extra: pip install 'recoder-billing[stripe]'."
        ) from e


@dataclass(frozen=True)
class StripeConfig:
    """Host-supplied Stripe configuration (replaces Polar's import-time globals)."""

    api_key: str
    api_version: str = "2026-01-28.clover"
    statement_descriptor: str | None = None


class StripeError(Exception):
    """Raised for Stripe SDK failures surfaced through the wrapper."""


class StripeService:
    """Async wrapper over the Stripe SDK, configured per host (no import-time globals).

    The SDK module is resolved lazily and the API key/version applied on first use, so
    constructing a :class:`StripeService` never requires the SDK to be installed — only
    invoking an operation does.
    """

    def __init__(self, config: StripeConfig) -> None:
        self._config = config
        self._stripe: Any | None = None

    @property
    def _lib(self) -> Any:
        if self._stripe is None:
            stripe_lib = _require_stripe()
            stripe_lib.api_key = self._config.api_key
            stripe_lib.api_version = self._config.api_version
            self._stripe = stripe_lib
        return self._stripe

    # --- Payment intents (checkout confirmation) -----------------------------------

    async def create_payment_intent(self, **params: Any) -> Any:
        return await self._lib.PaymentIntent.create_async(**params)

    async def get_payment_intent(self, intent_id: str) -> Any:
        return await self._lib.PaymentIntent.retrieve_async(intent_id)

    async def confirm_payment_intent(self, intent_id: str, **params: Any) -> Any:
        return await self._lib.PaymentIntent.confirm_async(intent_id, **params)

    async def get_confirmation_token(self, token_id: str) -> Any:
        return await self._lib.ConfirmationToken.retrieve_async(token_id)

    # --- Refunds -------------------------------------------------------------------

    async def create_refund(
        self,
        *,
        charge_id: str,
        amount: int,
        reason: Literal["duplicate", "requested_by_customer"] = "requested_by_customer",
        metadata: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        return await self._lib.Refund.create_async(
            charge=charge_id,
            amount=amount,
            reason=reason,
            metadata=metadata or {},
            idempotency_key=idempotency_key,
        )

    # --- Connect: transfers & payouts ----------------------------------------------

    async def transfer(
        self,
        *,
        destination: str,
        amount: int,
        currency: str = "usd",
        metadata: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        return await self._lib.Transfer.create_async(
            amount=amount,
            currency=currency,
            destination=destination,
            metadata=metadata or {},
            idempotency_key=idempotency_key,
        )

    async def reverse_transfer(
        self,
        transfer_id: str,
        *,
        amount: int | None = None,
        metadata: dict[str, str] | None = None,
    ) -> Any:
        params: dict[str, Any] = {
            "metadata": metadata or {},
            "idempotency_key": f"recoder:transfer_reverse:{transfer_id}",
        }
        if amount is not None:
            params["amount"] = amount
        return await self._lib.Transfer.create_reversal_async(transfer_id, **params)

    async def retrieve_connect_balance(self, stripe_account: str) -> tuple[str, int]:
        """Return ``(currency, available_amount)`` for a connected account.

        Fused from Polar's ``retrieve_balance``: the available balance in the account's
        default currency (we assume a single-currency balance).
        """
        account = await self._lib.Account.retrieve_async(stripe_account)
        balance = await self._lib.Balance.retrieve_async(stripe_account=stripe_account)
        for entry in balance.available:
            if entry.currency == account.default_currency:
                return (entry.currency, entry.amount)
        return (account.default_currency, 0)

    async def create_payout(
        self,
        *,
        stripe_account: str,
        amount: int,
        currency: str,
        metadata: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        params: dict[str, Any] = {
            "stripe_account": stripe_account,
            "amount": amount,
            "currency": currency,
            "metadata": metadata or {},
            "idempotency_key": idempotency_key,
        }
        if self._config.statement_descriptor is not None:
            params["statement_descriptor"] = self._config.statement_descriptor
        return await self._lib.Payout.create_async(**params)

    async def get_payout(self, *, payout_id: str, stripe_account: str) -> Any:
        return await self._lib.Payout.retrieve_async(
            payout_id, stripe_account=stripe_account
        )

    async def get_charge(
        self,
        charge_id: str,
        *,
        stripe_account: str | None = None,
        expand: list[str] | None = None,
    ) -> Any:
        return await self._lib.Charge.retrieve_async(
            charge_id, stripe_account=stripe_account, expand=expand or []
        )

    # --- Customers -----------------------------------------------------------------

    async def create_customer(self, **params: Any) -> Any:
        return await self._lib.Customer.create_async(**params)

    async def get_customer(self, customer_id: str) -> Any:
        return await self._lib.Customer.retrieve_async(customer_id)


__all__ = ["StripeConfig", "StripeError", "StripeService"]
