"""Stripe processor adapters. Fused from polar/integrations/stripe/payment.py + the
inlined Stripe calls in polar/checkout, polar/order and polar/payout, owned by Recoder.

Polar's ``polar.integrations.stripe.payment`` resolved Stripe webhook objects back to
checkouts/orders/payouts and drove their services directly, with the SDK calls scattered
across each service. In the owned spine the dependency arrow is inverted: the billing
services declare narrow *ports*
(:class:`~recoder_billing.billing.checkout.service.PaymentProcessor`,
:class:`~recoder_billing.billing.order.service.RefundProcessor`,
:class:`~recoder_billing.billing.payout.service.PayoutProcessorPort`) and *this* module
is the single adapter that implements all three on top of
:class:`~recoder_billing.integrations.stripe.service.StripeService`.

This is real merged logic — amount conversion, metadata assembly, idempotency keys,
status mapping — not a stub: the only thing it does not do is reach the network, which
happens inside :class:`StripeService` behind the lazy SDK import.
"""

from __future__ import annotations

from typing import Any

from ...billing.checkout.service import PaymentIntent, PaymentProcessor
from ...billing.order.service import RefundProcessor, RefundResult
from ...billing.payout.service import (
    Payout,
    PayoutProcessorPort,
    ProviderPayoutResult,
    TransferResult,
)
from ...models.order import Order
from .service import StripeService


def _intent_status(stripe_status: str) -> str:
    """Map a Stripe PaymentIntent status onto the owned processor-intent taxonomy.

    The owned :class:`PaymentIntent` distinguishes ``succeeded`` / ``failed`` /
    everything-else-pending (``requires_action``, ``processing``, ``requires_*``).
    Stripe's ``canceled`` is a terminal failure for our purposes.
    """
    if stripe_status == "succeeded":
        return "succeeded"
    if stripe_status == "canceled":
        return "failed"
    return stripe_status


class StripePaymentAdapter(PaymentProcessor):
    """Implements the checkout :class:`PaymentProcessor` port with Stripe PaymentIntents.

    Fuses Polar's confirmation-token + payment-intent flow: create a PaymentIntent for
    the checkout amount, attach the buyer's confirmation token, confirm it, and translate
    the resulting Stripe status into an owned :class:`PaymentIntent`.
    """

    def __init__(self, stripe: StripeService) -> None:
        self._stripe = stripe

    async def confirm_payment(
        self,
        *,
        amount: int,
        currency: str,
        confirmation_token_id: str | None,
        idempotency_key: str,
    ) -> PaymentIntent:
        params: dict[str, Any] = {
            "amount": amount,
            "currency": currency,
            "confirm": True,
            "idempotency_key": idempotency_key,
            "automatic_payment_methods": {
                "enabled": True,
                "allow_redirects": "never",
            },
        }
        if confirmation_token_id is not None:
            params["confirmation_token"] = confirmation_token_id

        try:
            intent = await self._stripe.create_payment_intent(**params)
        except Exception as e:  # SDK raises stripe.CardError etc. — surface as a failure.
            return PaymentIntent(
                intent_id="",
                status="failed",
                error_type=e.__class__.__name__,
                error=str(e),
            )

        last_error = getattr(intent, "last_payment_error", None)
        error_type = getattr(last_error, "type", None) if last_error else None
        error_message = getattr(last_error, "message", None) if last_error else None
        return PaymentIntent(
            intent_id=intent.id,
            status=_intent_status(intent.status),
            error_type=error_type,
            error=error_message,
        )


class StripeRefundAdapter(RefundProcessor):
    """Implements the order :class:`RefundProcessor` port with Stripe refunds.

    Fuses Polar's refund issuance: resolve the original charge from the order's stored
    processor metadata and issue a refund for ``amount + tax_amount`` against it, keyed
    by the owned idempotency key so a retried refund is never double-issued.
    """

    def __init__(self, stripe: StripeService) -> None:
        self._stripe = stripe

    def _charge_id(self, order: Order) -> str | None:
        """The Stripe charge id the order was paid on, if the host recorded one."""
        metadata = getattr(order, "processor_metadata", None)
        if isinstance(metadata, dict):
            charge_id = metadata.get("charge_id")
            if isinstance(charge_id, str):
                return charge_id
        return None

    async def issue_refund(
        self, *, order: Order, amount: int, tax_amount: int, idempotency_key: str
    ) -> RefundResult:
        charge_id = self._charge_id(order)
        if charge_id is None:
            return RefundResult(
                refund_id="",
                succeeded=False,
                error=f"Order {order.id} has no recorded charge to refund.",
            )
        try:
            refund = await self._stripe.create_refund(
                charge_id=charge_id,
                amount=amount + tax_amount,
                metadata={"order_id": str(order.id)},
                idempotency_key=idempotency_key,
            )
        except Exception as e:
            return RefundResult(refund_id="", succeeded=False, error=str(e))

        return RefundResult(
            refund_id=refund.id,
            succeeded=refund.status in ("succeeded", "pending"),
            error=None if refund.status in ("succeeded", "pending") else refund.status,
        )


class StripePayoutAdapter(PayoutProcessorPort):
    """Implements the :class:`PayoutProcessorPort` with Stripe Connect.

    Fuses Polar's two-step payout: the transfer *to* the connected account and the payout
    *from* it, plus balance retrieval and transfer reversal. The connected-account id is
    read from the payout account's owned ``processor_id``; the converted account amount is
    resolved from the transfer's destination charge balance transaction when the source
    and account currencies differ (otherwise the gross amount carries through).
    """

    def __init__(self, stripe: StripeService) -> None:
        self._stripe = stripe

    @staticmethod
    def _require_connect_id(payout_account: Any) -> str:
        connect_id = getattr(payout_account, "processor_id", None)
        if not connect_id:
            raise ValueError(
                f"Payout account {getattr(payout_account, 'id', '?')} is not "
                "connected to Stripe (missing processor_id)."
            )
        return connect_id

    async def transfer(
        self,
        *,
        payout: Payout,
        payout_account: Any,
        idempotency_key: str,
    ) -> TransferResult:
        connect_id = self._require_connect_id(payout_account)
        transfer = await self._stripe.transfer(
            destination=connect_id,
            amount=payout.amount,
            currency=payout.currency,
            metadata={"payout_id": str(payout.id)},
            idempotency_key=idempotency_key,
        )

        account_amount = payout.account_amount
        # Cross-currency transfer: the settled account amount comes from the
        # destination charge's balance transaction (Polar's conversion path).
        if payout.currency != payout.account_currency:
            destination_payment = getattr(transfer, "destination_payment", None)
            if destination_payment is not None:
                charge_id = (
                    destination_payment
                    if isinstance(destination_payment, str)
                    else getattr(destination_payment, "id", None)
                )
                if charge_id is not None:
                    charge = await self._stripe.get_charge(
                        charge_id,
                        stripe_account=connect_id,
                        expand=["balance_transaction"],
                    )
                    balance_transaction = getattr(charge, "balance_transaction", None)
                    account_amount = (
                        getattr(balance_transaction, "amount", 0)
                        if balance_transaction is not None
                        else 0
                    )

        return TransferResult(transfer_id=transfer.id, account_amount=account_amount)

    async def retrieve_balance(self, payout_account: Any) -> int:
        connect_id = self._require_connect_id(payout_account)
        _, amount = await self._stripe.retrieve_connect_balance(connect_id)
        return amount

    async def create_payout(
        self,
        *,
        payout: Payout,
        payout_account: Any,
        amount: int,
        idempotency_key: str,
    ) -> ProviderPayoutResult:
        connect_id = self._require_connect_id(payout_account)
        try:
            stripe_payout = await self._stripe.create_payout(
                stripe_account=connect_id,
                amount=amount,
                currency=payout.account_currency,
                metadata={"payout_id": str(payout.id)},
                idempotency_key=idempotency_key,
            )
        except Exception as e:
            # Polar deliberately records the failure instead of raising: Stripe has
            # many hidden payout rules outside our control.
            return ProviderPayoutResult(processor_id=None, succeeded=False, error=str(e))

        return ProviderPayoutResult(processor_id=stripe_payout.id, succeeded=True)

    async def reverse_transfer(self, *, payout: Payout, transfer_id: str) -> str:
        reversal = await self._stripe.reverse_transfer(
            transfer_id,
            metadata={"payout_id": str(payout.id)},
        )
        return reversal.id


__all__ = [
    "StripePaymentAdapter",
    "StripePayoutAdapter",
    "StripeRefundAdapter",
]
