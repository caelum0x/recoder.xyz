"""Billing operations wired onto the internal IPC surface.

:func:`build_billing_operations` assembles the ``operations`` map that
:func:`..ipc.internal_api.build_internal_router` dispatches: an operation name -> an async
``(payload) -> result`` handler. Each handler decodes the envelope payload into the owned
billing service inputs, calls the fused service over its host-supplied port(s), and returns
a JSON-serializable result. This is the single point where the checkout / subscription /
order / webhook spine is exposed to @recoder/distribution.

The ports (repositories, payment/refund processors, webhook delivery, host guard, lifecycle
hooks) are injected via :class:`BillingPorts` — the host supplies the real implementations;
this module never fabricates one. Handlers are only registered for the ports the host
actually provides, so a partial deployment exposes exactly the operations it can satisfy.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from ..billing.checkout.schemas import CheckoutConfirm, CheckoutCreate
from ..billing.checkout.service import (
    CheckoutRepository,
    CheckoutService,
    PaymentProcessor,
)
from ..billing.order.service import OrderRepository, OrderService, RefundProcessor
from ..billing.subscription.service import (
    LifecycleHooks,
    SubscriptionRepository,
    SubscriptionService,
)
from ..billing.webhook.service import (
    HostGuard,
    HttpDelivery,
    WebhookEndpoint,
    WebhookEventType,
    WebhookFormat,
    WebhookService,
)
from ..models.customer import Address
from ..models.product import Product

Operation = Callable[[dict[str, Any]], Awaitable[Any]]


@dataclass(frozen=True)
class BillingPorts:
    """Host-supplied ports backing the internal billing operations.

    A port left ``None`` simply omits the operations that depend on it from the registered
    map — the host exposes exactly what it can satisfy, and the guard still denies anything
    unregistered with ``unknown_operation``.
    """

    checkout_repository: CheckoutRepository | None = None
    payment_processor: PaymentProcessor | None = None
    order_repository: OrderRepository | None = None
    refund_processor: RefundProcessor | None = None
    subscription_repository: SubscriptionRepository | None = None
    lifecycle_hooks: LifecycleHooks | None = None
    http_delivery: HttpDelivery | None = None
    host_guard: HostGuard | None = None
    product_lookup: Callable[[uuid.UUID], Awaitable[Product | None]] | None = None


def _address(value: dict[str, Any] | None) -> Address | None:
    if value is None:
        return None
    return Address(
        country=value["country"],
        state=value.get("state"),
        city=value.get("city"),
        line1=value.get("line1"),
        line2=value.get("line2"),
        postal_code=value.get("postal_code"),
    )


def _checkout_result(checkout: Any) -> dict[str, Any]:
    return {
        "id": str(checkout.id),
        "status": checkout.status.value,
        "amount": checkout.amount,
        "currency": checkout.currency,
        "product_id": str(checkout.product_id),
        "product_price_id": str(checkout.product_price_id),
    }


def _order_result(order: Any) -> dict[str, Any]:
    return {
        "id": str(order.id),
        "status": order.status.value,
        "currency": order.currency,
        "net_amount": order.net_amount,
        "tax_amount": order.tax_amount,
        "total_amount": order.total_amount,
        "refunded_amount": order.refunded_amount,
    }


def _subscription_result(subscription: Any) -> dict[str, Any]:
    return {
        "id": str(subscription.id),
        "status": subscription.status.value,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "canceled": subscription.canceled,
    }


def build_billing_operations(
    ports: BillingPorts,
    *,
    checkout: CheckoutService | None = None,
    order: OrderService | None = None,
    subscription: SubscriptionService | None = None,
    webhook: WebhookService | None = None,
) -> dict[str, Operation]:
    """Build the operation map for :func:`..ipc.internal_api.build_internal_router`.

    Service singletons default to the module-level instances; pass overrides for testing.
    """
    checkout_service = checkout or CheckoutService()
    order_service = order or OrderService()
    subscription_service = subscription or SubscriptionService()
    webhook_service = webhook or WebhookService()

    operations: dict[str, Operation] = {}

    if ports.checkout_repository is not None and ports.product_lookup is not None:
        checkout_repository = ports.checkout_repository
        product_lookup = ports.product_lookup

        async def checkout_create(payload: dict[str, Any]) -> dict[str, Any]:
            product = await product_lookup(uuid.UUID(payload["product_id"]))
            if product is None:
                return {"error": "product_not_found", "product_id": payload["product_id"]}
            create = CheckoutCreate(
                product_id=uuid.UUID(payload["product_id"]),
                product_price_id=uuid.UUID(payload["product_price_id"]),
                currency=payload.get("currency", "usd"),
                amount=payload.get("amount"),
                seats=payload.get("seats"),
                customer_email=payload.get("customer_email"),
                customer_name=payload.get("customer_name"),
                customer_billing_address=_address(payload.get("customer_billing_address")),
                is_business_customer=payload.get("is_business_customer", False),
                require_billing_address=payload.get("require_billing_address", False),
            )
            result = await checkout_service.create(checkout_repository, product, create)
            return _checkout_result(result)

        operations["checkout.create"] = checkout_create

        if ports.payment_processor is not None:
            payment_processor = ports.payment_processor

            async def checkout_confirm(payload: dict[str, Any]) -> dict[str, Any]:
                confirm = CheckoutConfirm(
                    customer_name=payload.get("customer_name"),
                    customer_email=payload.get("customer_email"),
                    customer_billing_address=_address(
                        payload.get("customer_billing_address")
                    ),
                    confirmation_token_id=payload.get("confirmation_token_id"),
                )
                result = await checkout_service.confirm(
                    checkout_repository,
                    payment_processor,
                    uuid.UUID(payload["checkout_id"]),
                    confirm,
                )
                return _checkout_result(result)

            operations["checkout.confirm"] = checkout_confirm

    if ports.order_repository is not None and ports.refund_processor is not None:
        order_repository = ports.order_repository
        refund_processor = ports.refund_processor

        async def order_refund(payload: dict[str, Any]) -> dict[str, Any]:
            result = await order_service.process_refund(
                order_repository,
                refund_processor,
                uuid.UUID(payload["order_id"]),
                amount=int(payload["amount"]),
                tax_amount=int(payload.get("tax_amount", 0)),
            )
            return _order_result(result)

        operations["order.refund"] = order_refund

    if (
        ports.subscription_repository is not None
        and ports.lifecycle_hooks is not None
    ):
        subscription_repository = ports.subscription_repository
        lifecycle_hooks = ports.lifecycle_hooks

        async def subscription_cancel(payload: dict[str, Any]) -> dict[str, Any]:
            method = (
                subscription_service.revoke
                if payload.get("immediately")
                else subscription_service.cancel
            )
            result = await method(
                subscription_repository,
                lifecycle_hooks,
                uuid.UUID(payload["subscription_id"]),
                customer_reason=payload.get("customer_reason"),
                customer_comment=payload.get("customer_comment"),
            )
            return _subscription_result(result)

        async def subscription_uncancel(payload: dict[str, Any]) -> dict[str, Any]:
            result = await subscription_service.uncancel(
                subscription_repository,
                lifecycle_hooks,
                uuid.UUID(payload["subscription_id"]),
            )
            return _subscription_result(result)

        operations["subscription.cancel"] = subscription_cancel
        operations["subscription.uncancel"] = subscription_uncancel

    if ports.http_delivery is not None and ports.host_guard is not None:
        http_delivery = ports.http_delivery
        host_guard = ports.host_guard

        async def webhook_deliver(payload: dict[str, Any]) -> dict[str, Any]:
            endpoint = WebhookEndpoint(
                id=payload["endpoint"]["id"],
                url=payload["endpoint"]["url"],
                secret=payload["endpoint"]["secret"],
                events=tuple(
                    WebhookEventType(e) for e in payload["endpoint"]["events"]
                ),
                format=WebhookFormat(payload["endpoint"].get("format", "raw")),
                enabled=payload["endpoint"].get("enabled", True),
            )
            event = webhook_service.build_event(
                payload["event_id"],
                WebhookEventType(payload["type"]),
                payload["data"],
            )
            outcome = await webhook_service.deliver(
                http_delivery, host_guard, endpoint, event,
                attempt=int(payload.get("attempt", 1)),
            )
            return {
                "succeeded": outcome.succeeded,
                "status_code": outcome.status_code,
                "retry": outcome.retry,
                "retry_delay_ms": outcome.retry_delay_ms,
                "error": outcome.error,
            }

        operations["webhook.deliver"] = webhook_deliver

    return operations


__all__ = ["BillingPorts", "Operation", "build_billing_operations"]
