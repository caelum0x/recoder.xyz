"""
Shared pytest fixtures for E2E API tests

This file is intentionally standalone - it does NOT import from the backend
to keep E2E test dependencies minimal.

Test users are created directly in the auth database (better-auth tables)
and sessions are created via the session table with HMAC-signed tokens.
"""
import os
import secrets
import string
import hashlib
import hmac
import logging
import uuid

from dotenv import load_dotenv
load_dotenv()

import pytest
import httpx
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, Dict, Optional

from tests.config import E2ETestConfig

# Simple logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("e2e_tests")


# Register custom markers
def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "slow: Slow tests (streaming, long runs)")
    config.addinivalue_line("markers", "billing: Tests requiring billing/credits")


def _generate_random_yopmail() -> str:
    """Generate a random yopmail email address"""
    random_part = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(secrets.randbelow(5) + 8))
    return f"{random_part}@yopmail.com"


def _generate_session_token() -> str:
    """Generate a random session token (better-auth style)."""
    return secrets.token_urlsafe(48)


def _get_auth_db_url() -> str:
    """Get the auth database URL for direct table access."""
    url = os.getenv("AUTH_DATABASE_URL") or os.getenv("DATABASE_URL", "")
    if not url:
        raise ValueError("AUTH_DATABASE_URL or DATABASE_URL must be set for test user creation")
    # Normalize for psycopg sync usage
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Remove async driver specs for sync access
    url = url.replace("+psycopg", "").replace("+asyncpg", "")
    return url


# Module-level cache for test user info
_cached_test_user: Dict[str, str] | None = None


def _ensure_test_user_exists(test_config: E2ETestConfig) -> Dict[str, str]:
    """
    Create a test user directly in the better-auth user/session tables.

    Account initialization happens automatically when the user first
    hits an API endpoint (handled by the API server).
    """
    global _cached_test_user

    if _cached_test_user:
        logger.debug(f"Using cached test user: {_cached_test_user['email']}")
        return _cached_test_user

    import psycopg

    db_url = _get_auth_db_url()
    TEST_USER_EMAIL = _generate_random_yopmail()
    user_id = str(uuid.uuid4())
    session_token = _generate_session_token()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=2)

    logger.info(f"Creating test user: {TEST_USER_EMAIL}")

    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                # Create user in better-auth user table
                cur.execute(
                    """
                    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET "updatedAt" = EXCLUDED."updatedAt"
                    RETURNING id
                    """,
                    (user_id, "E2E Test User", TEST_USER_EMAIL, True, now, now),
                )
                row = cur.fetchone()
                if row:
                    user_id = str(row[0])

                # Create session
                session_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO "session" (id, "expiresAt", token, "userId", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (session_id, expires_at, session_token, user_id, now, now),
                )

                conn.commit()

        _cached_test_user = {
            "user_id": user_id,
            "email": TEST_USER_EMAIL,
            "session_token": session_token,
        }

        logger.info(f"Created test user: {TEST_USER_EMAIL} (ID: {user_id})")

        # Create profile (some APIs may require this)
        try:
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO profiles (user_id, email, full_name)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (user_id, TEST_USER_EMAIL, "E2E Test User"),
                    )
                    conn.commit()
        except Exception:
            pass  # Profile might be auto-created by trigger or not exist yet

        return _cached_test_user

    except Exception as e:
        if "already been registered" in str(e) or "duplicate key" in str(e).lower():
            # Retry with new email
            TEST_USER_EMAIL = _generate_random_yopmail()
            _cached_test_user = None
            return _ensure_test_user_exists(test_config)

        raise ValueError(f"Could not create test user: {e}")


@pytest.fixture(scope="session")
def test_config() -> E2ETestConfig:
    """Test configuration fixture - reads from environment variables"""
    return E2ETestConfig(
        base_url=os.getenv("TEST_API_URL", "http://localhost:8000/v1"),
        auth_database_url=os.getenv("AUTH_DATABASE_URL", os.getenv("DATABASE_URL", "")),
        better_auth_secret=os.getenv("BETTER_AUTH_SECRET", ""),
        admin_api_key=os.getenv("RECODER_ADMIN_API_KEY", ""),
    )


@pytest.fixture(scope="function")
async def test_user(test_config: E2ETestConfig) -> Dict[str, str]:
    """Get or create a test user"""
    user_info = _ensure_test_user_exists(test_config)

    print(f"\n{'='*60}")
    print(f"TEST USER: {user_info['email']}")
    print(f"{'='*60}\n")

    return user_info


@pytest.fixture
async def auth_token(test_user: Dict[str, str]) -> str:
    """Return the session token for the test user."""
    return test_user["session_token"]


@pytest.fixture
async def client(test_config: E2ETestConfig, auth_token: str) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Authenticated HTTP client for API requests"""
    async with httpx.AsyncClient(
        base_url=test_config.base_url,
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=test_config.request_timeout,
        follow_redirects=True
    ) as client:
        yield client
