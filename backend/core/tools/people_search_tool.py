"""People research tool using self-hosted SearXNG.

Searches for people via SearXNG (no API key, no rate limits) and extracts
structured professional information from the results.
"""

from typing import Optional
import asyncio
import os
import re
import structlog
import json
from decimal import Decimal
from urllib.parse import urlparse

import httpx

from core.agentpress.tool import Tool, ToolResult, openapi_schema, tool_metadata
from core.utils.config import config, EnvMode
from core.utils.logger import logger
from core.agentpress.thread_manager import ThreadManager
from core.billing.credits.manager import CreditManager
from core.billing.shared.config import TOKEN_PRICE_MULTIPLIER
from core.services.db import execute_one

SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://127.0.0.1:8888")


@tool_metadata(
    display_name="People Research",
    description="Find and research people with professional information",
    icon="User",
    color="bg-blue-100 dark:bg-blue-800/50",
    weight=250,
    visible=True,
    usage_guide="""
### SPECIALIZED PEOPLE SEARCH

**Uses self-hosted SearXNG — no external API key required.**

**WORKFLOW:**
1. **CLARIFY:** Ask specific questions
   - Name / role / title
   - Company or industry
   - Location
   - Expertise area
2. **REFINE:** Build detailed search query
3. **EXECUTE:** Run people_search

**SEARCH QUERY BEST PRACTICES:**
- Include name, role, company, or industry
- Examples:
  - "CTO of AI companies in San Francisco"
  - "Data scientists at Google"
  - "John Smith software engineer LinkedIn"

**NEVER:**
- Use vague queries — specificity is critical
"""
)
class PeopleSearchTool(Tool):
    def __init__(self, thread_manager: ThreadManager):
        super().__init__()
        self.thread_manager = thread_manager
        self.credit_manager = CreditManager()
        logger.info("People Search Tool initialized (SearXNG).")

    async def _get_current_thread_and_user(self) -> tuple[Optional[str], Optional[str]]:
        try:
            context_vars = structlog.contextvars.get_contextvars()
            thread_id = context_vars.get('thread_id')
            if not thread_id:
                return None, None
            thread = await execute_one(
                "SELECT account_id FROM threads WHERE thread_id::text = :thread_id LIMIT 1",
                {"thread_id": thread_id},
            )
            if thread:
                return thread_id, thread.get('account_id')
        except Exception as e:
            logger.error(f"Failed to get thread context: {e}")
        return None, None

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "people_search",
            "description": "Search for people using natural language queries. Returns names, URLs, and descriptions from web search results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query describing the people you want to find. Examples: 'CTO of AI startups in San Francisco', 'Data scientists at FAANG companies'"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (1-20, default 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }
    })
    async def people_search(
        self,
        query: str,
        num_results: int = 10,
    ) -> ToolResult:
        if not query:
            return self.fail_response("Search query is required.")

        num_results = max(1, min(num_results, 20))

        try:
            # Run multiple search strategies in parallel for richer results
            search_queries = [
                f"{query} site:linkedin.com",
                f"{query} professional profile OR biography OR resume",
            ]

            tasks = [
                self._searxng_search(sq, num_results)
                for sq in search_queries
            ]
            all_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Merge and deduplicate results by URL
            seen_urls: set[str] = set()
            merged: list[dict] = []
            for batch in all_results:
                if isinstance(batch, Exception):
                    logger.warning(f"People search sub-query failed: {batch}")
                    continue
                for r in batch:
                    url = r.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        merged.append(r)

            if not merged:
                return self.fail_response(
                    f"No results found for: {query}. Try a broader query."
                )

            # Parse and enrich each result with structured people info
            formatted = []
            for idx, r in enumerate(merged[:num_results], 1):
                title = r.get("title", "")
                url = r.get("url", "")
                content = r.get("content", "")

                person_info = self._extract_person_info(title, url, content)
                person_info["rank"] = idx
                person_info["engine"] = r.get("engine", "")
                formatted.append(person_info)

            output = {
                "query": query,
                "total_results": len(formatted),
                "results": formatted,
            }

            return self.success_response(json.dumps(output, indent=2, default=str))

        except asyncio.TimeoutError:
            return self.fail_response("Search timed out. Please try again with a simpler query.")
        except Exception as e:
            logger.error(f"People search failed: {e}", exc_info=True)
            return self.fail_response("An error occurred during the search. Please try again.")

    def _extract_person_info(self, title: str, url: str, content: str) -> dict:
        """Extract structured person information from a search result."""
        person_name = title
        domain = ""
        source = ""
        title_role = ""
        company = ""
        location = ""
        description = content

        # Extract domain from URL
        try:
            parsed = urlparse(url)
            domain = parsed.netloc
            if "linkedin.com" in domain:
                source = "linkedin"
            elif "twitter.com" in domain or "x.com" in domain:
                source = "twitter"
            elif "github.com" in domain:
                source = "github"
            elif "crunchbase.com" in domain:
                source = "crunchbase"
            elif "about.me" in domain:
                source = "about.me"
            else:
                source = "web"
        except Exception:
            pass

        # Clean person name from title patterns
        # LinkedIn: "John Smith - Software Engineer - Acme Inc. | LinkedIn"
        # General: "John Smith | Company"
        separators = [" | ", " - ", " — ", " – ", " :: "]
        name_parts = [person_name]
        for sep in separators:
            if sep in person_name:
                name_parts = [p.strip() for p in person_name.split(sep)]
                break

        if len(name_parts) >= 1:
            person_name = name_parts[0]
            # Remove trailing "LinkedIn", "Twitter", etc.
            for platform in ["LinkedIn", "Twitter", "GitHub", "X"]:
                person_name = person_name.replace(platform, "").strip()

        # Try to extract title/role from title parts or content
        if source == "linkedin" and len(name_parts) >= 2:
            # LinkedIn format: "Name - Title - Company | LinkedIn"
            if len(name_parts) >= 3:
                title_role = name_parts[1]
                company = name_parts[2].replace("LinkedIn", "").strip()
            elif len(name_parts) == 2:
                # Could be "Name - Title | LinkedIn" or "Name | LinkedIn"
                second = name_parts[1].replace("LinkedIn", "").strip()
                if second:
                    title_role = second

        # Try to extract title/role from content
        if not title_role:
            role_patterns = [
                r'(?:^|\.\s+)([A-Z][a-zA-Z\s]+?)\s+at\s+([A-Z][a-zA-Z\s&.]+)',
                r'(?:is|was)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)\s+(?:at|of)\s+([A-Z][a-zA-Z\s&.]+)',
                r'(CEO|CTO|CFO|COO|VP|Director|Manager|Engineer|Developer|Founder|Co-Founder|President|Partner)\b',
            ]
            for pattern in role_patterns:
                match = re.search(pattern, content)
                if match:
                    if match.lastindex and match.lastindex >= 2:
                        title_role = match.group(1).strip()
                        if not company:
                            company = match.group(2).strip()
                    else:
                        title_role = match.group(1).strip() if match.group(1) else match.group(0).strip()
                    break

        # Try to extract company from content if not yet found
        if not company:
            company_patterns = [
                r'at\s+([A-Z][a-zA-Z\s&.]+?)(?:\.|,|\s+[-–—])',
                r'(?:works?\s+(?:at|for)|employed\s+(?:at|by))\s+([A-Z][a-zA-Z\s&.]+?)(?:\.|,)',
            ]
            for pattern in company_patterns:
                match = re.search(pattern, content)
                if match:
                    company = match.group(1).strip()
                    break

        # Try to extract location from content
        location_patterns = [
            r'(?:based|located|lives?)\s+in\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s+[-–—])',
            r'([A-Z][a-zA-Z]+,\s*[A-Z]{2})\b',  # City, ST format
            r'([A-Z][a-zA-Z]+\s+(?:Area|Metropolitan|Region))',
        ]
        for pattern in location_patterns:
            match = re.search(pattern, content)
            if match:
                location = match.group(1).strip()
                break

        return {
            "person_name": person_name,
            "url": url,
            "domain": domain,
            "description": description,
            "source": source,
            "title": title_role if title_role else None,
            "company": company if company else None,
            "location": location if location else None,
        }

    async def _searxng_search(self, query: str, num_results: int) -> list[dict]:
        """Execute a search via SearXNG with categories=general."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{SEARXNG_URL}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "categories": "general",
                        "pageno": 1,
                    },
                )
                response.raise_for_status()
                data = response.json()

            raw = data.get("results", [])
            if not raw:
                logger.info(f"SearXNG returned 0 results for: '{query}', trying DDG fallback")
                return await self._ddg_fallback(query, num_results)

            results = []
            for r in raw[:num_results]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "engine": r.get("engine", ""),
                })

            logger.info(f"SearXNG returned {len(results)} people results for: '{query}'")
            return results

        except Exception as e:
            logger.warning(f"SearXNG people search failed: {e}, trying DuckDuckGo fallback")
            return await self._ddg_fallback(query, num_results)

    async def _ddg_fallback(self, query: str, num_results: int) -> list[dict]:
        """Fallback to DuckDuckGo if SearXNG is unavailable."""
        try:
            from duckduckgo_search import DDGS

            def _search():
                with DDGS() as ddgs:
                    return list(ddgs.text(query, max_results=num_results))

            raw = await asyncio.to_thread(_search)
            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "content": r.get("body", ""),
                    "engine": "duckduckgo",
                }
                for r in raw
            ]
        except Exception as e:
            logger.warning(f"DuckDuckGo fallback also failed: {e}")
            return []
