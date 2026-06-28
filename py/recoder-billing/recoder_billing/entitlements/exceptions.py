"""Entitlement errors. Merged from polar.exceptions, narrowed to the spine.

Status-coded errors so the IPC surface can render them truthfully (404/403/400/409),
never as a generic 500 and never as a faked success.
"""

from __future__ import annotations


class BillingError(Exception):
    """Base for all billing/entitlement errors. Carries an HTTP-style status code."""

    status_code: int = 500

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class ResourceNotFound(BillingError):
    def __init__(self, message: str = "Resource not found.") -> None:
        super().__init__(message, status_code=404)


class NotPermitted(BillingError):
    def __init__(self, message: str = "Operation not permitted.") -> None:
        super().__init__(message, status_code=403)


class BadRequest(BillingError):
    def __init__(self, message: str = "Bad request.") -> None:
        super().__init__(message, status_code=400)


class Conflict(BillingError):
    def __init__(self, message: str = "Conflict.") -> None:
        super().__init__(message, status_code=409)
