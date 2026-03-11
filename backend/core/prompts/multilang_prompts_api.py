"""
Multi-Language Prompts API endpoints.

Provides CRUD for prompt sets (named prompt collections) with per-language
variants, machine-translation tracking, quality scoring, and language
coverage statistics.
"""

import uuid
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows
from core.utils.logger import logger

router = APIRouter(prefix="/prompts/multilang", tags=["multilang-prompts"])

COMMON_LANGUAGES = ["en", "es", "fr", "de", "ja", "zh"]
VALID_CATEGORIES = ("general", "system", "coding", "writing", "analysis", "creative", "custom")


# ============================================================================
# Pydantic Models
# ============================================================================

class CreatePromptSetRequest(BaseModel):
    prompt_name: str
    base_language: Optional[str] = "en"
    description: Optional[str] = None
    category: Optional[str] = "general"


class CreateVariantRequest(BaseModel):
    language_code: str
    content: str
    is_machine_translated: Optional[bool] = False


# ============================================================================
# Endpoints
# ============================================================================

@router.post(
    "",
    summary="Create prompt set",
    operation_id="create_multilang_prompt_set",
)
async def create_prompt_set(
    body: CreatePromptSetRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Create a new multi-language prompt set."""
    category = body.category if body.category in VALID_CATEGORIES else "general"
    try:
        row = await execute_one(
            """
            INSERT INTO multilang_prompt_sets (
                user_id, prompt_name, base_language, description, category
            ) VALUES (
                :user_id, :prompt_name, :base_language, :description, :category
            )
            RETURNING *
            """,
            {
                "user_id": user_id,
                "prompt_name": body.prompt_name,
                "base_language": body.base_language or "en",
                "description": body.description,
                "category": category,
            },
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create prompt set")
        return serialize_row(dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating multilang prompt set: {e}")
        raise HTTPException(status_code=500, detail="Failed to create prompt set")


@router.get(
    "",
    summary="List prompt sets",
    operation_id="list_multilang_prompt_sets",
)
async def list_prompt_sets(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List all prompt sets for the authenticated user."""
    try:
        where_clauses = ["s.user_id = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit}

        if category and category in VALID_CATEGORIES:
            where_clauses.append("s.category = :category")
            params["category"] = category

        if search:
            where_clauses.append("(s.prompt_name ILIKE :search OR s.description ILIKE :search)")
            params["search"] = f"%{search}%"

        where_sql = " AND ".join(where_clauses)

        rows = await execute(
            f"""
            SELECT
                s.*,
                COUNT(v.id) AS variant_count
            FROM multilang_prompt_sets s
            LEFT JOIN multilang_prompt_variants v ON v.prompt_set_id = s.id
            WHERE {where_sql}
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows([dict(r) for r in rows]) if rows else []
    except Exception as e:
        logger.error(f"Error listing multilang prompt sets: {e}")
        raise HTTPException(status_code=500, detail="Failed to list prompt sets")


@router.get(
    "/stats",
    summary="Get multilang stats",
    operation_id="get_multilang_stats",
)
async def get_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Language distribution, coverage percentages per set, and sets missing
    translations for common languages (en, es, fr, de, ja, zh).
    """
    try:
        # Language distribution
        lang_rows = await execute(
            """
            SELECT v.language_code, COUNT(*) AS count
            FROM multilang_prompt_variants v
            JOIN multilang_prompt_sets s ON s.id = v.prompt_set_id
            WHERE s.user_id = :user_id
            GROUP BY v.language_code
            ORDER BY count DESC
            """,
            {"user_id": user_id},
        )

        # Coverage per set
        coverage_rows = await execute(
            """
            SELECT
                s.id,
                s.prompt_name,
                s.category,
                s.base_language,
                COUNT(v.id) AS variant_count,
                ARRAY_AGG(v.language_code) FILTER (WHERE v.language_code IS NOT NULL) AS languages
            FROM multilang_prompt_sets s
            LEFT JOIN multilang_prompt_variants v ON v.prompt_set_id = s.id
            WHERE s.user_id = :user_id
            GROUP BY s.id
            ORDER BY s.created_at DESC
            """,
            {"user_id": user_id},
        )

        # Sets missing any of the common languages
        sets_needing_translation: List[Dict[str, Any]] = []
        for row in coverage_rows:
            languages = row["languages"] or []
            missing = [lang for lang in COMMON_LANGUAGES if lang not in languages]
            if missing:
                sets_needing_translation.append({
                    "id": str(row["id"]),
                    "prompt_name": row["prompt_name"],
                    "missing_languages": missing,
                })

        total_sets = len(coverage_rows)
        fully_covered = sum(
            1
            for row in coverage_rows
            if all(lang in (row["languages"] or []) for lang in COMMON_LANGUAGES)
        )

        return {
            "language_distribution": serialize_rows([dict(r) for r in lang_rows]),
            "coverage_per_set": serialize_rows([dict(r) for r in coverage_rows]),
            "sets_needing_translation": sets_needing_translation,
            "summary": {
                "total_sets": total_sets,
                "fully_covered_sets": fully_covered,
                "common_languages": COMMON_LANGUAGES,
            },
        }
    except Exception as e:
        logger.error(f"Error fetching multilang stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


@router.get(
    "/{prompt_set_id}",
    summary="Get prompt set detail",
    operation_id="get_multilang_prompt_set",
)
async def get_prompt_set(
    prompt_set_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get a single prompt set with all its variants."""
    try:
        row = await execute_one(
            "SELECT * FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Prompt set not found")

        variants = await execute(
            "SELECT * FROM multilang_prompt_variants WHERE prompt_set_id = :id ORDER BY language_code",
            {"id": prompt_set_id},
        )

        result = serialize_row(dict(row))
        result["variants"] = serialize_rows([dict(v) for v in variants]) if variants else []
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching multilang prompt set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch prompt set")


@router.delete(
    "/{prompt_set_id}",
    summary="Delete prompt set",
    operation_id="delete_multilang_prompt_set",
)
async def delete_prompt_set(
    prompt_set_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a prompt set and all its variants (cascade)."""
    try:
        await execute_mutate(
            "DELETE FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        return {"deleted": True, "prompt_set_id": prompt_set_id}
    except Exception as e:
        logger.error(f"Error deleting multilang prompt set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete prompt set")


@router.post(
    "/{prompt_set_id}/variants",
    summary="Upsert variant",
    operation_id="upsert_multilang_variant",
)
async def upsert_variant(
    prompt_set_id: str,
    body: CreateVariantRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add or update a language variant for a prompt set (upsert by prompt_set_id + language_code)."""
    try:
        # Verify ownership
        ps = await execute_one(
            "SELECT id FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        if not ps:
            raise HTTPException(status_code=404, detail="Prompt set not found")

        row = await execute_one(
            """
            INSERT INTO multilang_prompt_variants (
                prompt_set_id, user_id, language_code, content, is_machine_translated
            ) VALUES (
                :prompt_set_id, :user_id, :language_code, :content, :is_machine_translated
            )
            ON CONFLICT (prompt_set_id, language_code) DO UPDATE
            SET content = EXCLUDED.content,
                is_machine_translated = EXCLUDED.is_machine_translated,
                updated_at = now()
            RETURNING *
            """,
            {
                "prompt_set_id": prompt_set_id,
                "user_id": user_id,
                "language_code": body.language_code,
                "content": body.content,
                "is_machine_translated": body.is_machine_translated or False,
            },
        )

        # Also bump updated_at on the parent set
        await execute_mutate(
            "UPDATE multilang_prompt_sets SET updated_at = now() WHERE id = :id",
            {"id": prompt_set_id},
        )

        return serialize_row(dict(row))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error upserting variant for set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to upsert variant")


@router.get(
    "/{prompt_set_id}/variants",
    summary="List variants",
    operation_id="list_multilang_variants",
)
async def list_variants(
    prompt_set_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List all language variants for a prompt set."""
    try:
        ps = await execute_one(
            "SELECT id FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        if not ps:
            raise HTTPException(status_code=404, detail="Prompt set not found")

        rows = await execute(
            "SELECT * FROM multilang_prompt_variants WHERE prompt_set_id = :id ORDER BY language_code",
            {"id": prompt_set_id},
        )
        return serialize_rows([dict(r) for r in rows]) if rows else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing variants for set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list variants")


@router.delete(
    "/{prompt_set_id}/variants/{language_code}",
    summary="Delete variant",
    operation_id="delete_multilang_variant",
)
async def delete_variant(
    prompt_set_id: str,
    language_code: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a specific language variant from a prompt set."""
    try:
        ps = await execute_one(
            "SELECT id FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        if not ps:
            raise HTTPException(status_code=404, detail="Prompt set not found")

        await execute_mutate(
            """
            DELETE FROM multilang_prompt_variants
            WHERE prompt_set_id = :prompt_set_id AND language_code = :language_code
            """,
            {"prompt_set_id": prompt_set_id, "language_code": language_code},
        )
        return {"deleted": True, "prompt_set_id": prompt_set_id, "language_code": language_code}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting variant {language_code} for set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete variant")


@router.get(
    "/{prompt_set_id}/variant/{language_code}",
    summary="Get single variant",
    operation_id="get_multilang_variant",
)
async def get_variant(
    prompt_set_id: str,
    language_code: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Get a specific language variant. Falls back to base_language content if the
    requested language is not found.
    """
    try:
        ps = await execute_one(
            "SELECT * FROM multilang_prompt_sets WHERE id = :id AND user_id = :user_id",
            {"id": prompt_set_id, "user_id": user_id},
        )
        if not ps:
            raise HTTPException(status_code=404, detail="Prompt set not found")

        row = await execute_one(
            """
            SELECT * FROM multilang_prompt_variants
            WHERE prompt_set_id = :prompt_set_id AND language_code = :language_code
            """,
            {"prompt_set_id": prompt_set_id, "language_code": language_code},
        )

        if row:
            result = serialize_row(dict(row))
            result["is_fallback"] = False
            return result

        # Fallback to base language
        base_lang = ps["base_language"] or "en"
        fallback_row = await execute_one(
            """
            SELECT * FROM multilang_prompt_variants
            WHERE prompt_set_id = :prompt_set_id AND language_code = :language_code
            """,
            {"prompt_set_id": prompt_set_id, "language_code": base_lang},
        )
        if fallback_row:
            result = serialize_row(dict(fallback_row))
            result["is_fallback"] = True
            result["fallback_language"] = base_lang
            result["requested_language"] = language_code
            return result

        raise HTTPException(
            status_code=404,
            detail=f"No variant found for language '{language_code}' and no base language fallback available",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching variant {language_code} for set {prompt_set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch variant")
