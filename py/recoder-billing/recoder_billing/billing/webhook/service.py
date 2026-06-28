"""Webhook engine. Fused from polar/webhook/service.py + tasks.py, owned by Recoder.

Polar's webhook stack spans a Pydantic payload union, a SQLAlchemy delivery/event model,
a dramatiq worker with FIFO ordering, and httpx delivery. The *owned* engine is the part
that defines the wire contract and the delivery state machine:

- :class:`WebhookEventType` / :class:`WebhookFormat`: the canonical event taxonomy.
- :func:`build_event`: assemble the ``{type, timestamp, data}`` payload (Polar's
  ``WebhookPayloadTypeAdapter`` shape) and serialize it to the exact bytes that get signed.
- :class:`WebhookService.deliver`: sign (via :mod:`.webhooks`), SSRF-guard the URL, POST
  through an :class:`HttpDelivery` port, classify the response, and decide retry/backoff
  vs permanent failure — the same decisions Polar's task makes, minus the worker.

The HTTP IO is the :class:`HttpDelivery` port; the SSRF host check is the
:class:`HostGuard` port (Polar resolved DNS + rejected private IPs). Both are host-supplied
— no fake — so the signing + delivery decisions compile and are testable without httpx,
SQLAlchemy, or a worker.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol

from ...kit.utils import utc_now
from .webhooks import SignedWebhook, sign_webhook, verify_webhook

DEFAULT_MAX_RETRIES = 10
DEFAULT_BACKOFF_BASE_MS = 1000


class WebhookEventType(StrEnum):
    """Canonical outbound webhook event taxonomy. Fused from polar webhook_endpoint.py."""

    checkout_created = "checkout.created"
    checkout_updated = "checkout.updated"
    checkout_expired = "checkout.expired"
    customer_created = "customer.created"
    customer_updated = "customer.updated"
    customer_deleted = "customer.deleted"
    customer_state_changed = "customer.state_changed"
    order_created = "order.created"
    order_updated = "order.updated"
    order_paid = "order.paid"
    order_refunded = "order.refunded"
    subscription_created = "subscription.created"
    subscription_updated = "subscription.updated"
    subscription_active = "subscription.active"
    subscription_canceled = "subscription.canceled"
    subscription_uncanceled = "subscription.uncanceled"
    subscription_revoked = "subscription.revoked"
    subscription_past_due = "subscription.past_due"
    refund_created = "refund.created"
    refund_updated = "refund.updated"
    product_created = "product.created"
    product_updated = "product.updated"
    benefit_created = "benefit.created"
    benefit_updated = "benefit.updated"
    benefit_grant_created = "benefit_grant.created"
    benefit_grant_cycled = "benefit_grant.cycled"
    benefit_grant_updated = "benefit_grant.updated"
    benefit_grant_revoked = "benefit_grant.revoked"
    organization_updated = "organization.updated"


class WebhookFormat(StrEnum):
    """Delivery format of a webhook endpoint. Fused from polar webhook_endpoint.py."""

    raw = "raw"
    discord = "discord"
    slack = "slack"


@dataclass(frozen=True)
class WebhookEndpoint:
    """The owned shape of a subscribed endpoint (canonical fields the engine reads)."""

    id: object
    url: str
    secret: str
    events: tuple[WebhookEventType, ...]
    format: WebhookFormat = WebhookFormat.raw
    enabled: bool = True

    def is_subscribed(self, event: WebhookEventType) -> bool:
        return self.enabled and event in self.events


@dataclass(frozen=True)
class WebhookEvent:
    """A built, ready-to-sign outbound event. Owned replacement for Polar's ORM event.

    ``payload`` is the canonical serialized JSON body. Signing and delivery must use these
    exact bytes, so it is produced once here and never re-serialized.
    """

    id: str
    type: WebhookEventType
    timestamp: datetime
    payload: str

    @classmethod
    def build(
        cls, event_id: str, event: WebhookEventType, data: Any, *, at: datetime | None = None
    ) -> "WebhookEvent":
        """Assemble the ``{type, timestamp, data}`` payload and serialize it deterministically.

        Mirrors Polar's ``WebhookPayloadTypeAdapter.validate_python({type, timestamp, data})``
        followed by ``get_raw_payload``. ``data`` is the already-shaped resource dict.
        """
        timestamp = at or utc_now()
        body = {
            "type": event.value,
            "timestamp": timestamp.isoformat(),
            "data": data,
        }
        payload = json.dumps(body, separators=(",", ":"), sort_keys=True, default=str)
        return cls(id=event_id, type=event, timestamp=timestamp, payload=payload)


@dataclass(frozen=True)
class DeliveryResponse:
    """The result of an HTTP delivery attempt (returned by :class:`HttpDelivery`)."""

    status_code: int
    body: str | None = None


@dataclass(frozen=True)
class DeliveryOutcome:
    """The classified outcome of a delivery attempt + the next action.

    ``succeeded`` is true for a 2xx. When false, ``retry`` indicates whether the engine
    will retry (with ``retry_delay_ms``) or treat the failure as permanent.
    """

    succeeded: bool
    status_code: int | None
    retry: bool = False
    retry_delay_ms: int | None = None
    error: str | None = None
    response_body: str | None = None


class HttpDelivery(Protocol):
    """Port for the outbound HTTP POST (httpx in the host)."""

    async def post(
        self, url: str, *, content: str, headers: dict[str, str], timeout: float
    ) -> DeliveryResponse: ...


class HostGuard(Protocol):
    """Port for the SSRF check: reject URLs resolving to private/reserved IPs.

    Fused from Polar's ``resolve_and_validate_ip`` / ``_is_blocked_url``. The host supplies
    the real DNS resolution + IP classification; this engine only asks "is this URL safe to
    POST to?". Implementations raise to block.
    """

    async def assert_allowed(self, url: str) -> None: ...


def _compute_backoff_ms(attempt: int, base_ms: int) -> int:
    """Exponential backoff for delivery attempt ``attempt`` (1-based). Fused from Polar."""
    return base_ms * (2 ** max(0, attempt - 1))


class WebhookService:
    """Owned webhook engine: build, sign, deliver, classify; verify inbound."""

    def build_event(
        self,
        event_id: str,
        event: WebhookEventType,
        data: Any,
        *,
        at: datetime | None = None,
    ) -> WebhookEvent:
        """Build a signable event payload. See :meth:`WebhookEvent.build`."""
        return WebhookEvent.build(event_id, event, data, at=at)

    def sign(self, endpoint: WebhookEndpoint, event: WebhookEvent) -> SignedWebhook:
        """Sign ``event`` for ``endpoint`` using the endpoint's secret."""
        return sign_webhook(
            secret=endpoint.secret,
            msg_id=event.id,
            timestamp=int(event.timestamp.timestamp()),
            payload=event.payload,
        )

    async def deliver(
        self,
        delivery: HttpDelivery,
        host_guard: HostGuard,
        endpoint: WebhookEndpoint,
        event: WebhookEvent,
        *,
        attempt: int = 1,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_base_ms: int = DEFAULT_BACKOFF_BASE_MS,
        timeout: float = 10.0,
    ) -> DeliveryOutcome:
        """Deliver a signed event and classify the outcome. Fused from Polar's send task.

        Decisions preserved from Polar: skip a disabled/unsubscribed endpoint; SSRF-guard
        the URL before sending; a 2xx succeeds; a non-2xx or transport error retries with
        exponential backoff until ``max_retries``, then becomes a permanent failure.
        """
        if not endpoint.is_subscribed(event.type):
            return DeliveryOutcome(
                succeeded=False,
                status_code=None,
                retry=False,
                error="endpoint is disabled or not subscribed to this event",
            )

        try:
            await host_guard.assert_allowed(endpoint.url)
        except Exception as e:  # noqa: BLE001 - host guard signals block by raising
            return DeliveryOutcome(
                succeeded=False, status_code=None, retry=False, error=str(e)
            )

        signed = self.sign(endpoint, event)
        try:
            response = await delivery.post(
                endpoint.url,
                content=event.payload,
                headers=signed.headers(),
                timeout=timeout,
            )
        except Exception as e:  # noqa: BLE001 - transport errors -> retry decision
            return self._failure_outcome(
                attempt, max_retries, backoff_base_ms, status_code=None, error=str(e)
            )

        if 200 <= response.status_code < 300:
            return DeliveryOutcome(
                succeeded=True,
                status_code=response.status_code,
                response_body=_truncate(response.body),
            )

        return self._failure_outcome(
            attempt,
            max_retries,
            backoff_base_ms,
            status_code=response.status_code,
            error=f"non-2xx response: {response.status_code}",
            response_body=_truncate(response.body),
        )

    def _failure_outcome(
        self,
        attempt: int,
        max_retries: int,
        backoff_base_ms: int,
        *,
        status_code: int | None,
        error: str,
        response_body: str | None = None,
    ) -> DeliveryOutcome:
        if attempt >= max_retries:
            return DeliveryOutcome(
                succeeded=False,
                status_code=status_code,
                retry=False,
                error=error,
                response_body=response_body,
            )
        return DeliveryOutcome(
            succeeded=False,
            status_code=status_code,
            retry=True,
            retry_delay_ms=_compute_backoff_ms(attempt, backoff_base_ms),
            error=error,
            response_body=response_body,
        )

    def verify_inbound(
        self,
        *,
        secret: str,
        payload: str,
        headers: dict[str, str],
        now: int | None = None,
    ) -> None:
        """Verify an inbound webhook from its svix-style headers + raw body.

        Reads ``webhook-id`` / ``webhook-timestamp`` / ``webhook-signature`` from
        ``headers`` and delegates to :func:`..webhooks.verify_webhook`. Header lookup is
        case-insensitive. Raises :class:`..webhooks.WebhookSignatureError` on failure.
        """
        lower = {k.lower(): v for k, v in headers.items()}
        msg_id = lower.get("webhook-id")
        timestamp_raw = lower.get("webhook-timestamp")
        signature = lower.get("webhook-signature")
        if not (msg_id and timestamp_raw and signature):
            from .webhooks import WebhookSignatureError

            raise WebhookSignatureError(
                "missing_headers", "Missing one of the required webhook headers."
            )
        verify_webhook(
            secret=secret,
            payload=payload,
            msg_id=msg_id,
            timestamp=int(timestamp_raw),
            signature_header=signature,
            now=now if now is not None else int(utc_now().timestamp()),
        )


def _truncate(body: str | None, limit: int = 2048) -> str | None:
    """Trim + null-byte-strip a response body for storage. Fused from Polar's delivery."""
    if not body:
        return None
    return body.replace("\x00", "")[:limit]


webhook = WebhookService()


__all__ = [
    "DEFAULT_BACKOFF_BASE_MS",
    "DEFAULT_MAX_RETRIES",
    "DeliveryOutcome",
    "DeliveryResponse",
    "HostGuard",
    "HttpDelivery",
    "WebhookEndpoint",
    "WebhookEvent",
    "WebhookEventType",
    "WebhookFormat",
    "WebhookService",
    "webhook",
]
