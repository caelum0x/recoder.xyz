"""Tests for the webhook engine: HMAC sign/verify round-trip + delivery classification."""

import uuid

import pytest

from recoder_billing.billing.webhook.service import (
    DeliveryResponse,
    WebhookEndpoint,
    WebhookEventType,
    WebhookService,
)
from recoder_billing.billing.webhook.webhooks import (
    WebhookSignatureError,
    sign_webhook,
    verify_webhook,
)

SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"


class TestSignVerify:
    def test_round_trip(self) -> None:
        signed = sign_webhook(
            secret=SECRET, msg_id="msg_1", timestamp=1700000000, payload='{"a":1}'
        )
        assert signed.signature.startswith("v1,")
        verify_webhook(
            secret=SECRET,
            payload='{"a":1}',
            msg_id="msg_1",
            timestamp=1700000000,
            signature_header=signed.signature,
            now=1700000010,
        )

    def test_tampered_payload_fails(self) -> None:
        signed = sign_webhook(
            secret=SECRET, msg_id="msg_1", timestamp=1700000000, payload='{"a":1}'
        )
        with pytest.raises(WebhookSignatureError):
            verify_webhook(
                secret=SECRET,
                payload='{"a":2}',
                msg_id="msg_1",
                timestamp=1700000000,
                signature_header=signed.signature,
                now=1700000010,
            )

    def test_stale_timestamp_fails(self) -> None:
        signed = sign_webhook(
            secret=SECRET, msg_id="msg_1", timestamp=1700000000, payload="{}"
        )
        with pytest.raises(WebhookSignatureError):
            verify_webhook(
                secret=SECRET,
                payload="{}",
                msg_id="msg_1",
                timestamp=1700000000,
                signature_header=signed.signature,
                now=1700000000 + 10_000,
            )


class _StubDelivery:
    def __init__(self, response=None, *, raises=False) -> None:
        self.response = response
        self.raises = raises
        self.calls = 0

    async def post(self, url, *, content, headers, timeout):
        self.calls += 1
        if self.raises:
            raise RuntimeError("connection reset")
        return self.response


class _AllowGuard:
    async def assert_allowed(self, url: str) -> None:
        return None


class _BlockGuard:
    async def assert_allowed(self, url: str) -> None:
        raise RuntimeError("blocked: private ip")


def _endpoint() -> WebhookEndpoint:
    return WebhookEndpoint(
        id=uuid.uuid4(),
        url="https://example.com/hook",
        secret=SECRET,
        events=(WebhookEventType.order_paid,),
    )


@pytest.mark.asyncio
class TestDeliver:
    async def test_2xx_succeeds(self) -> None:
        delivery = _StubDelivery(DeliveryResponse(status_code=200, body="ok"))
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.order_paid, {"id": "ord_1"}
        )
        outcome = await WebhookService().deliver(
            delivery, _AllowGuard(), _endpoint(), event
        )
        assert outcome.succeeded is True
        assert outcome.status_code == 200

    async def test_5xx_retries_with_backoff(self) -> None:
        delivery = _StubDelivery(DeliveryResponse(status_code=503))
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.order_paid, {"id": "ord_1"}
        )
        outcome = await WebhookService().deliver(
            delivery, _AllowGuard(), _endpoint(), event, attempt=1
        )
        assert outcome.succeeded is False
        assert outcome.retry is True
        assert outcome.retry_delay_ms == 1000

    async def test_exhausted_retries_permanent_failure(self) -> None:
        delivery = _StubDelivery(DeliveryResponse(status_code=500))
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.order_paid, {"id": "ord_1"}
        )
        outcome = await WebhookService().deliver(
            delivery, _AllowGuard(), _endpoint(), event, attempt=10, max_retries=10
        )
        assert outcome.succeeded is False
        assert outcome.retry is False

    async def test_blocked_host_not_delivered(self) -> None:
        delivery = _StubDelivery(DeliveryResponse(status_code=200))
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.order_paid, {"id": "ord_1"}
        )
        outcome = await WebhookService().deliver(
            delivery, _BlockGuard(), _endpoint(), event
        )
        assert outcome.succeeded is False
        assert delivery.calls == 0

    async def test_unsubscribed_event_skipped(self) -> None:
        delivery = _StubDelivery(DeliveryResponse(status_code=200))
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.product_created, {"id": "p_1"}
        )
        outcome = await WebhookService().deliver(
            delivery, _AllowGuard(), _endpoint(), event
        )
        assert outcome.succeeded is False
        assert delivery.calls == 0

    async def test_inbound_verify_round_trip(self) -> None:
        event = WebhookService().build_event(
            "evt_1", WebhookEventType.order_paid, {"id": "ord_1"}
        )
        signed = WebhookService().sign(_endpoint(), event)
        headers = signed.headers()
        WebhookService().verify_inbound(
            secret=SECRET,
            payload=event.payload,
            headers=headers,
            now=int(event.timestamp.timestamp()) + 5,
        )
