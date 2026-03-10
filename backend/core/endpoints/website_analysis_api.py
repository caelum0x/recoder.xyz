"""Lightweight website analysis endpoint for onboarding context extraction."""

import re
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, validator
import httpx

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.llm import make_llm_api_call
from core.utils.logger import logger

router = APIRouter(prefix="/website-analysis", tags=["website-analysis"])


class WebsiteAnalysisRequest(BaseModel):
    url: str = Field(..., min_length=5)

    @validator("url")
    def validate_url(cls, v):
        v = v.strip()
        # Auto-prepend https:// if missing
        if not v.startswith(("http://", "https://")):
            v = f"https://{v}"
        # Basic URL validation
        if not re.match(r"^https?://[a-zA-Z0-9._\-]+\.[a-zA-Z]{2,}", v):
            raise ValueError("Invalid URL")
        return v


class WebsiteAnalysisResponse(BaseModel):
    businessType: str
    services: list[str]
    size: str
    summary: Optional[str] = None


@router.post("/extract-context")
async def extract_website_context(
    request: WebsiteAnalysisRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Fetch a website and use LLM to extract business context for onboarding."""
    try:
        # Fetch the website content
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; RecoderBot/1.0; +https://recoder.xyz)"
            },
        ) as client:
            resp = await client.get(request.url)
            resp.raise_for_status()

        html = resp.text

        # Strip HTML tags to get text content (lightweight, no dependency)
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()

        # Cap at 6000 chars for the LLM
        text = text[:6000]

        if len(text) < 50:
            raise HTTPException(status_code=422, detail="Could not extract meaningful content from this URL")

        # Use LLM to analyze
        prompt = f"""Analyze this website content and extract business information.

Website URL: {request.url}
Content: {text}

Return a JSON object with exactly these fields:
- "businessType": A short label for what this business/person does (e.g. "SaaS Company", "Digital Agency", "Freelance Designer", "E-commerce", "Developer")
- "services": An array of 3-6 key services, products, or focus areas
- "size": Best guess of company size from context (e.g. "Solo / Freelancer", "Small Team (2-10)", "Small Company (10-50)", "Medium Company (50-200)", "Large Company (200+)")
- "summary": One sentence describing the business

Return ONLY valid JSON, no markdown or explanation."""

        messages = [{"role": "user", "content": prompt}]

        response = await make_llm_api_call(
            messages=messages,
            model_name="openrouter/google/gemini-2.5-flash-lite",
            temperature=0.1,
            max_tokens=400,
            stream=False,
        )

        # Extract response content
        content = ""
        if isinstance(response, dict):
            content = (
                (response.get("choices") or [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
        elif hasattr(response, "choices") and response.choices:
            content = (response.choices[0].message.content or "").strip()

        if not content:
            raise HTTPException(status_code=500, detail="LLM returned empty response")

        # Parse JSON from response (handle markdown code blocks)
        content = re.sub(r"^```json\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse LLM response as JSON: {content[:200]}")
            raise HTTPException(status_code=500, detail="Failed to parse analysis result")

        return {
            "businessType": result.get("businessType", "Business"),
            "services": result.get("services", []),
            "size": result.get("size", "Unknown"),
            "summary": result.get("summary"),
        }

    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.warning(f"Failed to fetch URL {request.url}: {e}")
        raise HTTPException(status_code=422, detail=f"Could not fetch website: {str(e)}")
    except Exception as e:
        logger.error(f"Website analysis error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze website")
