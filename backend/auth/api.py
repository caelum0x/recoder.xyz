"""
Auth API - OTP Email, Verification, and Metadata Endpoints

Provides endpoints for:
- OTP code generation and email delivery (fallback for expired magic links)
- OTP code verification with session creation
- Post-auth metadata updates (terms, referrals, onboarding, locale)
"""

from datetime import datetime, timedelta, timezone
import json
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from core.utils.logger import logger
from core.utils.config import config
from core.services.email import email_service
from core.services.db import execute_mutate, execute_one
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, _get_auth_engine
from core.referrals.service import ReferralService

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_EXPIRY_MINUTES = 60
OTP_LENGTH = 6


class SendOtpRequest(BaseModel):
    email: EmailStr


class SendOtpResponse(BaseModel):
    success: bool
    message: str


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str


class VerifyOtpResponse(BaseModel):
    success: bool
    message: str
    session_token: Optional[str] = None


class UpdateMetadataRequest(BaseModel):
    referral_code: Optional[str] = None
    terms_accepted_at: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    locale: Optional[str] = None


class UpdateMetadataResponse(BaseModel):
    success: bool
    metadata_updated: bool = False
    terms_updated: bool = False
    referral_processed: bool = False
    message: Optional[str] = None


class AuthMetadataResponse(BaseModel):
    success: bool
    metadata: dict


def _generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP code."""
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


@router.post("/send-otp", response_model=SendOtpResponse)
async def send_otp_email_endpoint(request: SendOtpRequest):
    """
    Generate and send a 6-digit OTP code to the given email address.

    Used as a fallback when magic links expire (e.g., due to email security
    scanners like Microsoft Defender pre-clicking links). The OTP is stored
    in the better-auth verification table and sent via email.
    """
    engine = await _get_auth_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Auth database not available")

    from sqlalchemy import text

    # Verify the email belongs to an existing user
    async with engine.connect() as conn:
        result = await conn.execute(
            text('SELECT "id" FROM "user" WHERE "email" = :email LIMIT 1'),
            {"email": request.email},
        )
        user_row = result.fetchone()

    if not user_row:
        # Return success regardless to prevent email enumeration
        return SendOtpResponse(
            success=True,
            message="If an account exists with that email, a verification code has been sent.",
        )

    otp_code = _generate_otp()
    verification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)

    # Clear any existing OTP verifications for this email, then insert new one
    async with engine.begin() as conn:
        await conn.execute(
            text(
                'DELETE FROM "verification" '
                'WHERE "identifier" = :identifier AND "expiresAt" < :now'
            ),
            {"identifier": f"otp:{request.email}", "now": now},
        )
        await conn.execute(
            text(
                'INSERT INTO "verification" '
                '("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") '
                "VALUES (:id, :identifier, :value, :expires_at, :created_at, :updated_at)"
            ),
            {
                "id": verification_id,
                "identifier": f"otp:{request.email}",
                "value": otp_code,
                "expires_at": expires_at,
                "created_at": now,
                "updated_at": now,
            },
        )

    # Send the OTP email
    try:
        sent = email_service.send_otp_email(request.email, otp_code)
        if not sent:
            logger.warning(f"Failed to send OTP email to {request.email}")
    except Exception as exc:
        logger.error(f"Error sending OTP email: {exc}")

    return SendOtpResponse(
        success=True,
        message="If an account exists with that email, a verification code has been sent.",
    )


@router.post("/verify-otp", response_model=VerifyOtpResponse)
async def verify_otp_endpoint(request: VerifyOtpRequest):
    """
    Verify a 6-digit OTP code and create a session for the user.

    On success, returns a session token that can be used as a Bearer token
    or set as a session cookie.
    """
    engine = await _get_auth_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Auth database not available")

    from sqlalchemy import text

    now = datetime.now(timezone.utc)

    # Look up the OTP verification record
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                'SELECT "id", "value", "expiresAt" FROM "verification" '
                'WHERE "identifier" = :identifier '
                'ORDER BY "createdAt" DESC LIMIT 1'
            ),
            {"identifier": f"otp:{request.email}"},
        )
        verification_row = result.fetchone()

        if not verification_row:
            raise HTTPException(status_code=400, detail="No verification code found. Please request a new code.")

        ver_id, stored_code, expires_at = verification_row

        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            # Clean up expired record
            await conn.execute(
                text('DELETE FROM "verification" WHERE "id" = :id'),
                {"id": ver_id},
            )
            raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new code.")

        if stored_code != request.code.strip():
            raise HTTPException(status_code=400, detail="Invalid verification code.")

        # Code is valid — delete it so it can't be reused
        await conn.execute(
            text('DELETE FROM "verification" WHERE "id" = :id'),
            {"id": ver_id},
        )

    # Look up the user
    async with engine.connect() as conn:
        result = await conn.execute(
            text('SELECT "id" FROM "user" WHERE "email" = :email LIMIT 1'),
            {"email": request.email},
        )
        user_row = result.fetchone()

    if not user_row:
        raise HTTPException(status_code=400, detail="User not found.")

    user_id = user_row[0]

    # Create a new session
    session_token = secrets.token_urlsafe(32)
    session_id = str(uuid.uuid4())
    session_expires = now + timedelta(days=30)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                'INSERT INTO "session" '
                '("id", "userId", "token", "expiresAt", "createdAt", "updatedAt") '
                "VALUES (:id, :user_id, :token, :expires_at, :created_at, :updated_at)"
            ),
            {
                "id": session_id,
                "user_id": user_id,
                "token": session_token,
                "expires_at": session_expires,
                "created_at": now,
                "updated_at": now,
            },
        )

    return VerifyOtpResponse(
        success=True,
        message="Verification successful.",
        session_token=session_token,
    )


@router.post("/update-metadata", response_model=UpdateMetadataResponse)
async def update_auth_metadata(
    request: UpdateMetadataRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Update post-auth metadata for session-authenticated users.

    - terms_accepted_at: stored on basejump.accounts.public_metadata
    - referral_code: processed directly through ReferralService
    """
    if (
        not request.referral_code
        and not request.terms_accepted_at
        and request.onboarding_completed is None
        and request.locale is None
    ):
        raise HTTPException(status_code=400, detail="No metadata fields provided")

    metadata_updates: dict = {}
    metadata_updated = False
    terms_updated = False
    referral_processed = False
    status_message = None

    if request.terms_accepted_at:
        try:
            parsed = datetime.fromisoformat(request.terms_accepted_at.replace("Z", "+00:00"))
            normalized_terms = parsed.isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid terms_accepted_at format")

        metadata_updates["terms_accepted_at"] = normalized_terms
        terms_updated = True

    if request.onboarding_completed is not None:
        metadata_updates["onboarding_completed"] = bool(request.onboarding_completed)

    if request.locale:
        metadata_updates["locale"] = request.locale

    if metadata_updates:
        await execute_mutate(
            """
            UPDATE basejump.accounts
            SET
                public_metadata = COALESCE(public_metadata, '{}'::jsonb) || CAST(:metadata AS jsonb),
                updated_at = now()
            WHERE id = :account_id
            """,
            {"account_id": user_id, "metadata": json.dumps(metadata_updates)},
        )
        metadata_updated = True

    if request.referral_code:
        referral_code = request.referral_code.strip().upper()
        if referral_code:
            referral_service = ReferralService()
            try:
                referrer_id = await referral_service.validate_referral_code(referral_code)
                if not referrer_id:
                    status_message = "Invalid referral code"
                elif referrer_id == user_id:
                    status_message = "Cannot apply own referral code"
                else:
                    result = await referral_service.process_referral(
                        referrer_id=referrer_id,
                        referred_account_id=user_id,
                        referral_code=referral_code,
                    )
                    referral_processed = bool(result.get("success"))
                    if not referral_processed:
                        status_message = result.get("message") or "Referral not processed"
            except Exception as exc:
                logger.warning(
                    f"Referral processing failed for user {user_id}: {exc}"
                )
                status_message = "Referral processing failed"

    return UpdateMetadataResponse(
        success=metadata_updated or referral_processed,
        metadata_updated=metadata_updated,
        terms_updated=terms_updated,
        referral_processed=referral_processed,
        message=status_message,
    )


@router.get("/metadata", response_model=AuthMetadataResponse)
async def get_auth_metadata(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    row = await execute_one(
        """
        SELECT public_metadata
        FROM basejump.accounts
        WHERE id = :account_id
        LIMIT 1
        """,
        {"account_id": user_id},
    )

    metadata = row.get("public_metadata") if row else {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}

    if not isinstance(metadata, dict):
        metadata = {}

    return AuthMetadataResponse(success=True, metadata=metadata)
