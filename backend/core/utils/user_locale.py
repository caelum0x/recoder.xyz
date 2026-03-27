"""
Utility functions for retrieving user locale preferences from the auth provider.
"""

from typing import Optional
from core.utils.logger import logger
from core.services.db import execute_one

# Supported locales (must match frontend)
SUPPORTED_LOCALES = ['en', 'de', 'it', 'zh', 'ja', 'pt', 'fr', 'es']
DEFAULT_LOCALE = 'en'


async def get_user_locale(user_id: str, client=None) -> str:
    """
    Get user's preferred locale from auth.users.raw_user_meta_data.

    Queries auth.users directly via SQLAlchemy.

    Args:
        user_id: The user ID (UUID string)
        client: Unused legacy parameter (kept for API compatibility).

    Returns:
        Locale string ('en', 'de', 'it', 'zh', 'ja', 'pt', 'fr', 'es') or 'en' as default
    """
    try:
        metadata = {}

        # Check user_preferences table for language setting
        row = await execute_one(
            """
            SELECT language
            FROM user_preferences
            WHERE user_id::text = :user_id
            LIMIT 1
            """,
            {"user_id": user_id},
        )
        if row:
            locale = row.get("language")
            if locale and locale in SUPPORTED_LOCALES:
                logger.debug(f"Found user locale preference: {locale} for user {user_id}")
                return locale

        return DEFAULT_LOCALE
        
    except Exception as e:
        logger.warning(f"Error fetching user locale for user {user_id}: {e}")
        return DEFAULT_LOCALE


def get_locale_context_prompt(locale: str) -> str:
    """
    Generate a locale-specific context prompt to add to the system prompt.

    Args:
        locale: User's preferred locale ('en', 'de', 'it', 'zh', 'ja', 'pt', 'fr', 'es')

    Returns:
        Formatted prompt string with locale instructions
    """
    # Simple instruction: respond in whatever language the user writes in
    return """## LANGUAGE
Respond in the language the user is writing in. Match their language naturally."""
