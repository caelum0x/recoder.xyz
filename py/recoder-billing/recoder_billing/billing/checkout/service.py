"""Hosted checkout flow. Fused from polar/checkout/service.py, owned by Recoder.

Polar's ``CheckoutService`` is ~2700 lines welded to SQLAlchemy sessions, auth subjects,
Stripe confirmation tokens, tax calculation, discount redemption locks, and the worker.
The *owned* spine — the part the hosted purchase actually turns on — is small and clear:

1. create: validate the chosen price against the product, validate any custom amount,
   compute the upfront amount, and open the checkout session.
2. update: amend an open checkout's buyer fields and re-price it.
3. confirm: gate on required fields + open status, then hand the charge to a
   :class:`PaymentProcessor` port and move the checkout to ``confirmed``.
4. handle_success / handle_failure: the terminal state machine driven by the processor's
   asynchronous result.

The Stripe-confirm IO is the :class:`PaymentProcessor` port; persistence is the
:class:`CheckoutRepository` port. Both are satisfied by the host — there is no in-package
fake — so nothing here imports SQLAlchemy or Stripe and the flow compiles standalone.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from ...models.checkout import Checkout, CheckoutStatus
from ...models.customer import Address
from ...models.product import Product, ProductPrice
from ..product.guard import is_custom_price, is_seat_price
from ..product.price_set import PriceSet, calculate_upfront_amount
from .guard import has_product_checkout
from .schemas import (
    CheckoutConfirm,
    CheckoutCreate,
    CheckoutValidationError,
    validate_custom_price_amount,
)


class CheckoutError(Exception):
    """Base error for the checkout flow."""


class CheckoutDoesNotExist(CheckoutError):
    def __init__(self, checkout_id: uuid.UUID) -> None:
        self.checkout_id = checkout_id
        super().__init__(f"Checkout {checkout_id} does not exist.")


class ExpiredCheckout(CheckoutError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        super().__init__("This checkout session has expired.")


class NotOpenCheckout(CheckoutError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        self.status = checkout.status
        super().__init__(f"Checkout {checkout.id} is not open: {checkout.status}")


class NotConfirmedCheckout(CheckoutError):
    def __init__(self, checkout: Checkout) -> None:
        self.checkout = checkout
        self.status = checkout.status
        super().__init__(f"Checkout {checkout.id} is not confirmed: {checkout.status}")


class PaymentError(CheckoutError):
    """The processor rejected the charge. Carries the processor's error type/message."""

    def __init__(
        self, checkout: Checkout, error_type: str | None, error: str | None
    ) -> None:
        self.checkout = checkout
        self.error_type = error_type
        self.error = error
        message = (
            f"The payment failed{f': {error}' if error else '.'} "
            "Please try again with a different payment method."
        )
        super().__init__(message)


class MissingCheckoutField(CheckoutError):
    def __init__(self, checkout: Checkout, field: str) -> None:
        self.checkout = checkout
        self.field = field
        super().__init__(f"Required checkout field is missing: {field}")


@dataclass(frozen=True)
class PaymentIntent:
    """The processor's result of confirming a charge.

    Returned by :class:`PaymentProcessor`. ``status`` is the processor's terminal-or-
    pending status (e.g. ``"succeeded"``, ``"requires_action"``, ``"failed"``);
    ``error_type``/``error`` carry a rejection reason when present.
    """

    intent_id: str
    status: str
    error_type: str | None = None
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status == "succeeded"

    @property
    def failed(self) -> bool:
        return self.status == "failed"


class PaymentProcessor(Protocol):
    """Port for the external charge confirmation (Stripe in the host).

    Polar inlined ``stripe_service.create_payment_intent`` / confirmation-token handling
    into the service. We push that single IO boundary behind this port so the owned
    confirm/success/failure state machine is exercisable without Stripe.
    """

    async def confirm_payment(
        self,
        *,
        amount: int,
        currency: str,
        confirmation_token_id: str | None,
        idempotency_key: str,
    ) -> PaymentIntent: ...


class CheckoutRepository(Protocol):
    """Durable persistence port for checkouts (satisfied by the host's DB layer)."""

    async def get(self, checkout_id: uuid.UUID) -> Checkout | None: ...

    async def save(self, checkout: Checkout) -> Checkout: ...


# Fields the confirm step requires the buyer to have supplied (here or on the checkout).
_REQUIRED_CONFIRM_FIELDS = ("customer_email",)


class CheckoutService:
    """Owned hosted-checkout flow over a repository + processor port."""

    def _resolve_price(
        self, product: Product, product_price_id: uuid.UUID, currency: str
    ) -> ProductPrice:
        """Validate that ``product_price_id`` belongs to ``product`` for ``currency``.

        Mirrors Polar's ``_get_validated_price``: the price must exist on the product and
        be present in the currency's price set; otherwise the checkout cannot be priced.
        """
        price = product.get_price(product_price_id)
        if price is None:
            raise CheckoutValidationError(
                "Price does not belong to this product.",
                loc=("body", "product_price_id"),
                input_value=product_price_id,
            )
        price_set = PriceSet.from_product(product, currency)
        if price not in list(price_set.prices):
            raise CheckoutValidationError(
                "Price is not available in the selected currency.",
                loc=("body", "product_price_id"),
                input_value=product_price_id,
            )
        return price

    def _price_checkout(
        self, price: ProductPrice, create_or_amount: CheckoutCreate
    ) -> int:
        """Compute the upfront amount for the chosen price, validating custom/seat input."""
        if is_custom_price(price) and create_or_amount.amount is not None:
            validate_custom_price_amount(
                price, create_or_amount.amount, create_or_amount.currency
            )
        if is_seat_price(price) and create_or_amount.seats is None:
            raise CheckoutValidationError(
                "Seats are required for a seat-based price.",
                loc=("body", "seats"),
                input_value=None,
            )
        return calculate_upfront_amount(
            [price],
            custom_amount=create_or_amount.amount,
            seats=create_or_amount.seats,
        )

    async def create(
        self,
        repository: CheckoutRepository,
        product: Product,
        create: CheckoutCreate,
    ) -> Checkout:
        """Open a checkout session for ``product`` from a validated create payload."""
        if product.is_archived:
            raise CheckoutValidationError(
                "Product is archived.",
                loc=("body", "product_id"),
                input_value=product.id,
            )
        price = self._resolve_price(product, create.product_price_id, create.currency)
        amount = self._price_checkout(price, create)

        checkout = Checkout(
            organization_id=product.organization_id,
            product_id=product.id,
            product_price_id=price.id,
            amount=amount,
            currency=create.currency,
            customer_id=create.customer_id,
            customer_name=create.customer_name,
            customer_email=create.customer_email,
            customer_billing_address=create.customer_billing_address,
            is_business_customer=create.is_business_customer,
            require_billing_address=create.require_billing_address,
        )
        return await repository.save(checkout)

    async def update(
        self,
        repository: CheckoutRepository,
        checkout_id: uuid.UUID,
        *,
        customer_name: str | None = None,
        customer_email: str | None = None,
        customer_billing_address: Address | None = None,
    ) -> Checkout:
        """Amend an open checkout's buyer fields. Raises if the checkout is not open."""
        checkout = await self._load_open(repository, checkout_id)

        if customer_name is not None:
            checkout.customer_name = customer_name
        if customer_email is not None:
            checkout.customer_email = customer_email
        if customer_billing_address is not None:
            checkout.customer_billing_address = customer_billing_address

        return await repository.save(checkout)

    async def confirm(
        self,
        repository: CheckoutRepository,
        processor: PaymentProcessor,
        checkout_id: uuid.UUID,
        confirm: CheckoutConfirm,
    ) -> Checkout:
        """Confirm an open checkout: gate required fields, charge, move to ``confirmed``.

        Fuses Polar's ``confirm``/``_confirm_inner`` gate: the checkout must be open and
        unexpired, every required field must be present (on the checkout or the confirm
        payload), the chosen price must still point at the product, and a full billing
        address is required for business buyers. The actual charge is delegated to the
        :class:`PaymentProcessor` port. A free (zero-amount) checkout skips the processor.
        """
        checkout = await self._load_open(repository, checkout_id)

        # Merge confirm-supplied fields onto the checkout before gating.
        if confirm.customer_name is not None:
            checkout.customer_name = confirm.customer_name
        if confirm.customer_email is not None:
            checkout.customer_email = confirm.customer_email
        if confirm.customer_billing_address is not None:
            checkout.customer_billing_address = confirm.customer_billing_address

        if not has_product_checkout(checkout):
            raise CheckoutValidationError(
                "Checkout is not pointed at a product price.",
                loc=("body", "product_price_id"),
                input_value=checkout.product_price_id,
            )

        for field in _REQUIRED_CONFIRM_FIELDS:
            if getattr(checkout, field) is None:
                raise MissingCheckoutField(checkout, field)

        if checkout.require_billing_address or checkout.is_business_customer:
            if checkout.customer_billing_address is None:
                raise MissingCheckoutField(checkout, "customer_billing_address")

        # Free checkout: no charge, straight to confirmed (the host calls handle_success).
        if checkout.amount > 0:
            intent = await processor.confirm_payment(
                amount=checkout.amount,
                currency=checkout.currency,
                confirmation_token_id=confirm.confirmation_token_id,
                idempotency_key=str(checkout.id),
            )
            if intent.failed:
                raise PaymentError(checkout, intent.error_type, intent.error)
            checkout.payment_intent_id = intent.intent_id

        checkout.status = CheckoutStatus.confirmed
        return await repository.save(checkout)

    async def handle_success(
        self, repository: CheckoutRepository, checkout_id: uuid.UUID
    ) -> Checkout:
        """Move a confirmed checkout to ``succeeded`` (driven by the processor result).

        Fuses Polar's ``handle_success``: only a confirmed checkout may succeed; the
        transition is idempotent (an already-succeeded checkout is returned unchanged).
        """
        checkout = await self._require(repository, checkout_id)
        if checkout.status == CheckoutStatus.succeeded:
            return checkout
        if checkout.status != CheckoutStatus.confirmed:
            raise NotConfirmedCheckout(checkout)
        checkout.status = CheckoutStatus.succeeded
        return await repository.save(checkout)

    async def handle_failure(
        self, repository: CheckoutRepository, checkout_id: uuid.UUID
    ) -> Checkout:
        """Move a confirmed checkout back/forward to ``failed`` (processor result).

        Fuses Polar's ``handle_failure``: a failed payment returns the checkout to a
        terminal ``failed`` state. Idempotent for an already-failed checkout.
        """
        checkout = await self._require(repository, checkout_id)
        if checkout.status == CheckoutStatus.failed:
            return checkout
        if checkout.status != CheckoutStatus.confirmed:
            raise NotConfirmedCheckout(checkout)
        checkout.status = CheckoutStatus.failed
        return await repository.save(checkout)

    async def expire_open(
        self, repository: CheckoutRepository, checkout_id: uuid.UUID
    ) -> Checkout:
        """Expire an open-but-past-TTL checkout. Explicit replacement for Polar's ORM hook."""
        checkout = await self._require(repository, checkout_id)
        if checkout.expire_if_due():
            return await repository.save(checkout)
        return checkout

    async def _require(
        self, repository: CheckoutRepository, checkout_id: uuid.UUID
    ) -> Checkout:
        checkout = await repository.get(checkout_id)
        if checkout is None:
            raise CheckoutDoesNotExist(checkout_id)
        return checkout

    async def _load_open(
        self, repository: CheckoutRepository, checkout_id: uuid.UUID
    ) -> Checkout:
        checkout = await self._require(repository, checkout_id)
        # Auto-expire on read, like Polar's before_update hook — but explicit and saved.
        if checkout.expire_if_due():
            await repository.save(checkout)
            raise ExpiredCheckout(checkout)
        if not checkout.is_open:
            raise NotOpenCheckout(checkout)
        return checkout


checkout = CheckoutService()


__all__ = [
    "CheckoutDoesNotExist",
    "CheckoutError",
    "CheckoutRepository",
    "CheckoutService",
    "ExpiredCheckout",
    "MissingCheckoutField",
    "NotConfirmedCheckout",
    "NotOpenCheckout",
    "PaymentError",
    "PaymentIntent",
    "PaymentProcessor",
    "checkout",
]
