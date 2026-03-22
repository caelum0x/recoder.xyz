"""
Phone MFA API — enroll, challenge, verify, and manage phone factors.

Stores factors and challenges in the better-auth ``verification`` table.

SMS delivery:
  - If TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER are set,
    sends real SMS via the Twilio REST API (no SDK needed).
  - Otherwise logs the OTP code for development/testing.

Identifier conventions in the verification table:
  - ``phone_factor:{user_id}:{factor_id}``  → persistent enrolled factor
  - ``phone_challenge:{factor_id}``          → temporary OTP challenge
"""

from datetime import datetime, timedelta, timezone
import json
import secrets
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from core.utils.logger import logger
from core.utils.config import config
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, _get_auth_engine

router = APIRouter(prefix="/mfa", tags=["mfa"])

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
PHONE_VERIFICATION_CUTOFF = "2025-12-24T00:09:30.000Z"

# ---------------------------------------------------------------------------
# SMS delivery
# ---------------------------------------------------------------------------

async def _send_sms(to: str, body: str) -> bool:
    """Send an SMS.  Returns True on success."""
    sid = config.TWILIO_ACCOUNT_SID
    token = config.TWILIO_AUTH_TOKEN
    from_number = config.TWILIO_FROM_NUMBER

    if sid and token and from_number:
        import httpx
        import base64

        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        auth_header = base64.b64encode(f"{sid}:{token}".encode()).decode()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Basic {auth_header}"},
                    data={"From": from_number, "To": to, "Body": body},
                )
                if resp.is_success:
                    logger.info("[MFA] SMS sent to %s", to[:6] + "****")
                    return True
                logger.error("[MFA] Twilio error %s: %s", resp.status_code, resp.text)
                return False
        except Exception as exc:
            logger.error("[MFA] SMS delivery failed: %s", exc)
            return False

    # Fallback: log for development
    logger.warning("[MFA] No SMS provider configured — OTP for %s: %s", to, body)
    return True


def _generate_otp() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class EnrollRequest(BaseModel):
    phone_number: str
    friendly_name: str = "Phone"

class EnrollResponse(BaseModel):
    id: str
    friendly_name: str
    phone_number: str

class ChallengeRequest(BaseModel):
    factor_id: str

class ChallengeResponse(BaseModel):
    id: str
    expires_at: Optional[str] = None

class VerifyRequest(BaseModel):
    factor_id: str
    challenge_id: str
    code: str

class VerifyResponse(BaseModel):
    success: bool
    message: str = ""

class FactorInfo(BaseModel):
    id: str
    friendly_name: Optional[str] = None
    factor_type: str = "phone"
    status: str = "pending"
    phone: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ListFactorsResponse(BaseModel):
    factors: List[FactorInfo]

class StatusResponse(BaseModel):
    current_level: Optional[str] = None
    next_level: Optional[str] = None
    current_authentication_methods: List[str] = []
    action_required: str = "none"
    message: str = ""
    phone_verification_required: bool = False
    user_created_at: Optional[str] = None
    cutoff_date: str = PHONE_VERIFICATION_CUTOFF
    verification_required: bool = False
    is_verified: bool = False
    factors: List[FactorInfo] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_factors(engine, user_id: str) -> list[dict]:
    """Fetch all phone factors for a user from the verification table."""
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                'SELECT "id", "identifier", "value", "createdAt", "updatedAt" '
                'FROM "verification" '
                "WHERE \"identifier\" LIKE :prefix"
            ),
            {"prefix": f"phone_factor:{user_id}:%"},
        )
        factors = []
        for row in rows:
            try:
                data = json.loads(row[2])  # value column
            except (json.JSONDecodeError, TypeError):
                continue
            factors.append({
                "id": data.get("id", row[0]),
                "friendly_name": data.get("friendly_name"),
                "factor_type": "phone",
                "status": data.get("status", "pending"),
                "phone": data.get("phone"),
                "created_at": str(row[3]) if row[3] else None,
                "updated_at": str(row[4]) if row[4] else None,
            })
        return factors


async def _get_user_created_at(engine, user_id: str) -> Optional[str]:
    async with engine.connect() as conn:
        row = await conn.execute(
            text('SELECT "createdAt" FROM "users" WHERE "id" = :uid'),
            {"uid": user_id},
        )
        result = row.fetchone()
        return str(result[0]) if result else None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/enroll", response_model=EnrollResponse)
async def enroll_phone(
    request: EnrollRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()
    factor_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    # Permanent entry (far-future expiry)
    expires = now + timedelta(days=365 * 10)

    factor_data = json.dumps({
        "id": factor_id,
        "phone": request.phone_number,
        "friendly_name": request.friendly_name,
        "status": "pending",
    })

    verification_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(
            text(
                'INSERT INTO "verification" '
                '("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") '
                "VALUES (:id, :identifier, :value, :expires_at, :created_at, :updated_at)"
            ),
            {
                "id": verification_id,
                "identifier": f"phone_factor:{user_id}:{factor_id}",
                "value": factor_data,
                "expires_at": expires,
                "created_at": now,
                "updated_at": now,
            },
        )

    # Send initial verification SMS
    otp = _generate_otp()
    challenge_id = str(uuid.uuid4())
    challenge_expires = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                'INSERT INTO "verification" '
                '("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") '
                "VALUES (:id, :identifier, :value, :expires_at, :created_at, :updated_at)"
            ),
            {
                "id": challenge_id,
                "identifier": f"phone_challenge:{factor_id}",
                "value": otp,
                "expires_at": challenge_expires,
                "created_at": now,
                "updated_at": now,
            },
        )

    await _send_sms(
        request.phone_number,
        f"Your Recoder verification code is: {otp}",
    )

    return EnrollResponse(
        id=factor_id,
        friendly_name=request.friendly_name,
        phone_number=request.phone_number,
    )


@router.post("/challenge", response_model=ChallengeResponse)
async def create_challenge(
    request: ChallengeRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()

    # Verify factor exists and belongs to user
    async with engine.connect() as conn:
        row = await conn.execute(
            text(
                'SELECT "value" FROM "verification" '
                "WHERE \"identifier\" LIKE :pattern LIMIT 1"
            ),
            {"pattern": f"phone_factor:{user_id}:{request.factor_id}"},
        )
        factor_row = row.fetchone()
        if not factor_row:
            raise HTTPException(status_code=404, detail="Factor not found")

        factor_data = json.loads(factor_row[0])
        phone = factor_data.get("phone")
        if not phone:
            raise HTTPException(status_code=400, detail="Factor has no phone number")

    # Delete old challenges for this factor
    async with engine.begin() as conn:
        await conn.execute(
            text('DELETE FROM "verification" WHERE "identifier" = :ident'),
            {"ident": f"phone_challenge:{request.factor_id}"},
        )

    # Create new challenge
    otp = _generate_otp()
    challenge_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=OTP_EXPIRY_MINUTES)

    async with engine.begin() as conn:
        await conn.execute(
            text(
                'INSERT INTO "verification" '
                '("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") '
                "VALUES (:id, :identifier, :value, :expires_at, :created_at, :updated_at)"
            ),
            {
                "id": challenge_id,
                "identifier": f"phone_challenge:{request.factor_id}",
                "value": otp,
                "expires_at": expires,
                "created_at": now,
                "updated_at": now,
            },
        )

    await _send_sms(phone, f"Your Recoder verification code is: {otp}")

    return ChallengeResponse(
        id=challenge_id,
        expires_at=expires.isoformat(),
    )


@router.post("/verify", response_model=VerifyResponse)
async def verify_challenge(
    request: VerifyRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()

    # Look up challenge
    async with engine.connect() as conn:
        row = await conn.execute(
            text(
                'SELECT "id", "value", "expiresAt" FROM "verification" '
                'WHERE "identifier" = :ident'
            ),
            {"ident": f"phone_challenge:{request.factor_id}"},
        )
        challenge_row = row.fetchone()
        if not challenge_row:
            raise HTTPException(status_code=400, detail="No active challenge found")

        stored_code = challenge_row[1]
        expires_at = challenge_row[2]
        if expires_at and datetime.now(timezone.utc) > expires_at.replace(tzinfo=timezone.utc):
            raise HTTPException(status_code=400, detail="Challenge expired")

        if not secrets.compare_digest(request.code.strip(), stored_code.strip()):
            raise HTTPException(status_code=400, detail="Invalid verification code")

    # Delete used challenge
    async with engine.begin() as conn:
        await conn.execute(
            text('DELETE FROM "verification" WHERE "identifier" = :ident'),
            {"ident": f"phone_challenge:{request.factor_id}"},
        )

    # Mark factor as verified
    async with engine.begin() as conn:
        row = await conn.execute(
            text(
                'SELECT "id", "value" FROM "verification" '
                "WHERE \"identifier\" LIKE :pattern LIMIT 1"
            ),
            {"pattern": f"phone_factor:{user_id}:{request.factor_id}"},
        )
        factor_row = row.fetchone()
        if factor_row:
            factor_data = json.loads(factor_row[1])
            factor_data["status"] = "verified"
            now = datetime.now(timezone.utc)
            await conn.execute(
                text(
                    'UPDATE "verification" SET "value" = :val, "updatedAt" = :updated '
                    'WHERE "id" = :id'
                ),
                {
                    "id": factor_row[0],
                    "val": json.dumps(factor_data),
                    "updated": now,
                },
            )

    return VerifyResponse(success=True, message="SMS code verified successfully")


@router.get("/factors", response_model=ListFactorsResponse)
async def list_factors(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()
    factors = await _get_user_factors(engine, user_id)
    return ListFactorsResponse(
        factors=[FactorInfo(**f) for f in factors]
    )


@router.delete("/factors/{factor_id}", response_model=VerifyResponse)
async def unenroll_factor(
    factor_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()

    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                'DELETE FROM "verification" '
                "WHERE \"identifier\" = :ident"
            ),
            {"ident": f"phone_factor:{user_id}:{factor_id}"},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Factor not found")

        # Also delete any pending challenges
        await conn.execute(
            text('DELETE FROM "verification" WHERE "identifier" = :ident'),
            {"ident": f"phone_challenge:{factor_id}"},
        )

    return VerifyResponse(success=True, message="Phone factor unenrolled successfully")


@router.get("/status", response_model=StatusResponse)
async def mfa_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    engine = await _get_auth_engine()

    factors = await _get_user_factors(engine, user_id)
    user_created_at = await _get_user_created_at(engine, user_id)

    phone_factors = [f for f in factors if f.get("factor_type") == "phone"]
    has_verified_phone = any(f.get("status") == "verified" for f in phone_factors)

    phone_mandatory_env = (config.PHONE_NUMBER_MANDATORY or "").lower() == "true"
    cutoff = datetime.fromisoformat(PHONE_VERIFICATION_CUTOFF.replace("Z", "+00:00"))
    is_new_user = False
    if user_created_at:
        try:
            created = datetime.fromisoformat(str(user_created_at).replace("Z", "+00:00"))
            is_new_user = created >= cutoff
        except (ValueError, TypeError):
            pass

    phone_verification_required = phone_mandatory_env and is_new_user and not has_verified_phone

    # Determine AAL-like status
    has_any_verified = any(f.get("status") == "verified" for f in factors)
    current_level = "aal2" if has_verified_phone else "aal1"
    next_level = "aal2" if has_any_verified else "aal1"

    if current_level == "aal1" and next_level == "aal1":
        action_required = "none"
        message = "MFA is not enrolled for this account"
    elif current_level == "aal1" and next_level == "aal2":
        action_required = "verify_mfa"
        message = "MFA verification required to access full features"
    elif current_level == "aal2" and next_level == "aal2":
        action_required = "none"
        message = "MFA is verified and active"
    else:
        action_required = "none"
        message = "MFA status determined"

    return StatusResponse(
        current_level=current_level,
        next_level=next_level,
        current_authentication_methods=[],
        action_required=action_required,
        message=message,
        phone_verification_required=phone_verification_required,
        user_created_at=user_created_at,
        cutoff_date=PHONE_VERIFICATION_CUTOFF,
        verification_required=phone_verification_required,
        is_verified=has_verified_phone,
        factors=[FactorInfo(**f) for f in factors],
    )
