"""Webhook engine: outbound build/sign/deliver + inbound verify.

The HMAC signing scheme (svix/standardwebhooks-compatible) is owned in :mod:`.webhooks`.
HTTP delivery lives behind :class:`HttpDelivery`; the SSRF host check behind
:class:`HostGuard`. Both are host-supplied ports.
"""

from .service import (
    DeliveryOutcome,
    DeliveryResponse,
    HostGuard,
    HttpDelivery,
    WebhookEndpoint,
    WebhookEvent,
    WebhookEventType,
    WebhookFormat,
    WebhookService,
    webhook,
)
from .webhooks import (
    SignedWebhook,
    WebhookSignatureError,
    sign_webhook,
    verify_webhook,
)

__all__ = [
    "DeliveryOutcome",
    "DeliveryResponse",
    "HostGuard",
    "HttpDelivery",
    "SignedWebhook",
    "WebhookEndpoint",
    "WebhookEvent",
    "WebhookEventType",
    "WebhookFormat",
    "WebhookService",
    "WebhookSignatureError",
    "sign_webhook",
    "verify_webhook",
    "webhook",
]
