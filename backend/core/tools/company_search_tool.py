"""Company research tool using self-hosted SearXNG.

Searches for companies via SearXNG (no API key, no rate limits) and extracts
structured company information from the results.
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
    display_name="Company Research",
    description="Find and research companies with detailed business information",
    icon="Building",
    color="bg-slate-100 dark:bg-slate-800/50",
    weight=260,
    visible=True,
    usage_guide="""
### SPECIALIZED COMPANY SEARCH

**Uses self-hosted SearXNG — no external API key required.**

**WORKFLOW:**
1. **CLARIFY:** Ask 3-5 specific questions
   - Industry/sector specifics
   - Location preferences
   - Company stage/size
   - Technology focus
2. **REFINE:** Build detailed search query
3. **EXECUTE:** Run company_search

**SEARCH QUERY BEST PRACTICES:**
- Use natural language to describe company criteria
- Include industry, location, size, or relevant factors
- Examples:
  - "AI startups in San Francisco with Series A funding"
  - "E-commerce companies in Austin with 50-200 employees"
  - "Healthcare technology companies in Boston"

**NEVER:**
- Use vague queries — specificity is critical
"""
)
class CompanySearchTool(Tool):
    def __init__(self, thread_manager: ThreadManager):
        super().__init__()
        self.thread_manager = thread_manager
        self.credit_manager = CreditManager()
        logger.info("Company Search Tool initialized (SearXNG).")

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
            "name": "company_search",
            "description": "Search for companies using natural language queries. Returns company names, URLs, and descriptions from web search results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query describing the companies you want to find. Examples: 'AI startups in San Francisco with recent funding', 'Fortune 500 companies in healthcare sector'"
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
    async def company_search(
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
                f"{query} company",
                f"{query} company overview site:linkedin.com OR site:crunchbase.com OR site:bloomberg.com",
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
                    logger.warning(f"Company search sub-query failed: {batch}")
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

            # Parse and enrich each result with structured company info
            formatted = []
            for idx, r in enumerate(merged[:num_results], 1):
                title = r.get("title", "")
                url = r.get("url", "")
                content = r.get("content", "")

                company_info = self._extract_company_info(title, url, content)
                company_info["rank"] = idx
                company_info["engine"] = r.get("engine", "")
                formatted.append(company_info)

            output = {
                "query": query,
                "total_results": len(formatted),
                "results": formatted,
            }

            return self.success_response(json.dumps(output, indent=2, default=str))

        except asyncio.TimeoutError:
            return self.fail_response("Search timed out. Please try again with a simpler query.")
        except Exception as e:
            logger.error(f"Company search failed: {e}", exc_info=True)
            return self.fail_response("An error occurred during the search. Please try again.")

    def _extract_company_info(self, title: str, url: str, content: str) -> dict:
        """Extract structured company information from a search result."""
        company_name = title
        domain = ""
        source = ""
        industry = ""
        location = ""
        description = content

        # Extract domain from URL
        try:
            parsed = urlparse(url)
            domain = parsed.netloc
            # Identify source type
            if "linkedin.com" in domain:
                source = "linkedin"
            elif "crunchbase.com" in domain:
                source = "crunchbase"
            elif "bloomberg.com" in domain:
                source = "bloomberg"
            elif "glassdoor.com" in domain:
                source = "glassdoor"
            elif "pitchbook.com" in domain:
                source = "pitchbook"
            else:
                source = "web"
        except Exception:
            pass

        # Clean company name from title patterns
        # e.g. "Acme Inc. | LinkedIn" -> "Acme Inc."
        # e.g. "Acme Inc. - Company Profile - Crunchbase" -> "Acme Inc."
        separators = [" | ", " - ", " — ", " – ", " :: "]
        for sep in separators:
            if sep in company_name:
                parts = company_name.split(sep)
                # Take the first part as the company name (usually the most relevant)
                company_name = parts[0].strip()
                break

        # Try to extract location from content
        location_patterns = [
            r'(?:headquartered|based|located)\s+in\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s+is|\s+and|\s+with)',
            r'([A-Z][a-zA-Z]+,\s*[A-Z]{2})\b',  # City, ST format
            r'([A-Z][a-zA-Z]+,\s*[A-Z][a-zA-Z]+)\b',  # City, Country format
        ]
        for pattern in location_patterns:
            match = re.search(pattern, content)
            if match:
                location = match.group(1).strip()
                break

        # Try to extract industry from content
        industry_keywords = [
            "technology", "software", "healthcare", "fintech", "finance",
            "artificial intelligence", "AI", "machine learning", "biotech",
            "e-commerce", "ecommerce", "SaaS", "cybersecurity", "edtech",
            "cleantech", "real estate", "manufacturing", "logistics",
            "automotive", "telecommunications", "media", "entertainment",
            "food", "agriculture", "energy", "retail", "consulting",
        ]
        content_lower = content.lower()
        for kw in industry_keywords:
            if kw.lower() in content_lower:
                industry = kw
                break

        return {
            "company_name": company_name,
            "url": url,
            "domain": domain,
            "description": description,
            "source": source,
            "industry": industry if industry else None,
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

            logger.info(f"SearXNG returned {len(results)} company results for: '{query}'")
            return results

        except Exception as e:
            logger.warning(f"SearXNG company search failed: {e}, trying DuckDuckGo fallback")
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
