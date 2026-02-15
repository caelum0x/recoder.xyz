"""
Test configuration for E2E API tests
"""
from dataclasses import dataclass
import os


@dataclass
class E2ETestConfig:
    """Configuration for E2E API tests"""
    base_url: str = os.getenv("TEST_API_URL", "http://localhost:8000/v1")
    auth_database_url: str = os.getenv("AUTH_DATABASE_URL", os.getenv("DATABASE_URL", ""))
    better_auth_secret: str = os.getenv("BETTER_AUTH_SECRET", "")
    admin_api_key: str = os.getenv("RECODER_ADMIN_API_KEY", "")
    test_user_password: str = os.getenv("TEST_USER_PASSWORD", "test_password_e2e_12345")
    request_timeout: float = float(os.getenv("TEST_REQUEST_TIMEOUT", "30.0"))
    agent_timeout: float = float(os.getenv("TEST_AGENT_TIMEOUT", "120.0"))
