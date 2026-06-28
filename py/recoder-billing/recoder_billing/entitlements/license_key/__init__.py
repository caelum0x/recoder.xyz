"""License-key entitlement: issue / validate / activate. The core billing->entitlement primitive."""

from .service import (
    LicenseKeyActivateRequest,
    LicenseKeyDeactivateRequest,
    LicenseKeyRepository,
    LicenseKeyService,
    LicenseKeyValidateRequest,
    license_key_service,
)

__all__ = [
    "LicenseKeyActivateRequest",
    "LicenseKeyDeactivateRequest",
    "LicenseKeyRepository",
    "LicenseKeyService",
    "LicenseKeyValidateRequest",
    "license_key_service",
]
