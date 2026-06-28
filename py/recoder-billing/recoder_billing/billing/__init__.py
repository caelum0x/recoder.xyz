"""Recoder billing engine — owned fusion of the Polar billing spine.

Subpackages:

- :mod:`.product` — price kinds, price sets, upfront-amount math.
- :mod:`.checkout` — hosted checkout flow + product guard (Stripe confirm behind a port).
- :mod:`.subscription` — lifecycle transitions + proration math (scheduler behind a port).
- :mod:`.order` — order creation + refund processing.
- :mod:`.webhook` — outbound + inbound webhook engine (HMAC signature kept).

Every infra dependency Polar hard-coupled to (SQLAlchemy session, Redis, worker tasks,
Stripe SDK) is replaced with a thin Protocol port so the owned domain logic compiles and
is testable standalone. The ports are satisfied by the host application (docker-backend
/ @recoder/distribution) — never by a fake.

The subpackages are wired onto the internal IPC surface via
:func:`recoder_billing.ipc.build_billing_operations`.
"""

from . import checkout, order, product, subscription, webhook

__all__ = ["checkout", "order", "product", "subscription", "webhook"]
