"""Internal IPC surface: the ONLY surface @recoder/distribution talks to.

``/internal/agent-os/billing/*`` guarded by INTERNAL_SERVICE_KEY + a signed envelope.
Never a public source of task/approval/artifact state (.claude/rules/api.md).
"""

from .envelope import (
    Envelope,
    EnvelopeVerificationError,
    sign_envelope,
    verify_envelope,
)

__all__ = [
    "Envelope",
    "EnvelopeVerificationError",
    "sign_envelope",
    "verify_envelope",
]
