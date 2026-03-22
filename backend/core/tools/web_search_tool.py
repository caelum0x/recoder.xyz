"""Free web search, scrape, crawl, and research tool for Recoder agents.

Uses SearXNG (self-hosted meta search engine, no API key, no rate limits) for search
and crawl4ai + httpx+BeautifulSoup for scraping/content extraction.
Supports deep research (search + scrape top results), site crawling, news search,
and JS-rendered page extraction via crawl4ai/Playwright.
"""

import asyncio
import json
import logging
import os
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from core.agentpress.tool import Tool, ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager


@tool_metadata(
    display_name="WebSearch",
    description="Search the web via SearXNG (self-hosted), research topics, crawl sites, and read web pages — free, no rate limits",
    icon="Search",
    color="bg-green-100 dark:bg-green-800/50",
    weight=30,
    visible=True,
    usage_guide="""
## WebSearch - Search the web for current information (FREE)

Search the web using DuckDuckGo and read/scrape web pages using httpx+BeautifulSoup.
No API keys required — completely free.

### Available Tools
- **web_search**: Search the web with single or BATCH queries via DuckDuckGo
- **scrape_webpage**: Extract full text content from web pages
- **deep_research**: Search + scrape top results for comprehensive research on a topic
- **crawl_site**: Follow links within a site to discover and extract related content
- **news_search**: Search recent news via DuckDuckGo News
- **render_js_page**: Render JS-heavy pages using headless Chromium (falls back to httpx)

### When to Use
- Accessing information beyond the knowledge cutoff
- Finding current information, news, recent events
- Researching topics that require up-to-date data
- Gathering information from multiple sources
- Fact-checking or verifying claims
- Reading documentation, articles, or reference pages
- Deep research on complex topics (use deep_research)
- Exploring a website's structure and content (use crawl_site)
- Reading JS-rendered SPAs or dynamic content (use render_js_page)

### When NOT to Use
- For information already in the conversation context
- When the user provides all necessary information
- For simple calculations or logic that doesn't need external data

### DO NOT OVERRIDE BROWSER-EXTRACTED DATA
- If you already visited a SPECIFIC website with browser_tool and extracted content from it, that extracted content is your **PRIMARY SOURCE**
- Web search results should NOT override or replace information you extracted directly from the target website
- Use web search only for ADDITIONAL context — NOT to replace first-hand data

### CRITICAL REQUIREMENT - Sources

After answering the user's question, you MUST include a "Sources:" section at the end of your response listing all relevant URLs from the search results as markdown hyperlinks.

Example format:
```
[Your answer here]

Sources:
- [Source Title 1](https://example.com/1)
- [Source Title 2](https://example.com/2)
```

### Batch Mode

**ALWAYS batch multiple queries into ONE call for efficiency:**
- WRONG: 3 separate web_search calls
- CORRECT: ONE call with query=["topic 1", "topic 2", "topic 3"]

### Usage Pattern

```
# Correct - batch all queries
web_search(query=["Tesla news 2025", "Tesla stock", "Tesla products"], num_results=5)

# Wrong - never do this
web_search(query="Tesla news")
web_search(query="Tesla stock")  # Wasteful!
```

### Search Query Best Practice

IMPORTANT: Use the correct year in search queries. When searching for recent information, documentation, or current events, use the current year (2025+) rather than previous years.

### Content Extraction (scrape_webpage)

Use scrape_webpage to fetch and analyze web content:
- Fetches URL content and converts HTML to clean text
- Removes scripts, styles, nav, footer clutter
- Truncates very long pages to fit in context
- Batch multiple URLs in a single call for efficiency

### Deep Research

Use deep_research for comprehensive topic investigation:
- Searches DuckDuckGo for the query
- Scrapes top 3-5 results automatically
- Returns a combined research output with all sources
- Great for complex questions that need multiple sources

### Site Crawling

Use crawl_site to explore a website:
- Starts from a URL and follows links within the same domain
- Configurable depth and max pages
- Returns content from all discovered pages

### Important Notes
- query parameter: native array ["q1", "q2"], NOT JSON string
- num_results: integer (5), NOT string ("5")
- Check publication dates for time-sensitive info
- Cross-validate information across multiple sources
"""
)
class SandboxWebSearchTool(SandboxToolsBase):
    """Tool for performing web searches using SearXNG (self-hosted) and scraping with crawl4ai + httpx."""

    # SearXNG URL — reads from env so it works both on host (localhost:8888)
    # and inside Docker containers (http://searxng:8080 via Docker network).
    SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://127.0.0.1:8888")

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    # ─── Shared HTTP helpers ───────────────────────────────────────────

    _HTTP_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    @staticmethod
    def _normalize_url(url: str) -> str:
        """Ensure URL has https:// protocol."""
        if not (url.startswith('http://') or url.startswith('https://')):
            url = 'https://' + url
        if url.startswith('http://'):
            url = 'https://' + url[7:]
        return url

    @staticmethod
    def _extract_text_from_html(html: str, max_chars: int = 12000) -> tuple[str, str]:
        """Parse HTML, strip boilerplate, return (title, clean_text)."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove non-content elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside",
                         "noscript", "iframe", "svg", "form", "button"]):
            tag.decompose()

        # Remove hidden elements
        for tag in soup.find_all(attrs={"aria-hidden": "true"}):
            tag.decompose()
        for tag in soup.find_all(style=lambda s: s and "display:none" in s.replace(" ", "")):
            tag.decompose()
        for tag in soup.find_all(style=lambda s: s and "visibility:hidden" in s.replace(" ", "")):
            tag.decompose()

        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        text = soup.get_text(separator="\n", strip=True)

        # Collapse blank lines
        lines = text.split("\n")
        cleaned_lines: list[str] = []
        prev_empty = False
        for line in lines:
            line = line.strip()
            if not line:
                if not prev_empty:
                    cleaned_lines.append("")
                prev_empty = True
            else:
                cleaned_lines.append(line)
                prev_empty = False
        text = "\n".join(cleaned_lines)

        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[Content truncated at {} characters]".format(max_chars)

        return title, text

    @staticmethod
    def _extract_links_from_html(html: str, base_url: str) -> list[str]:
        """Extract all absolute links from HTML that belong to the same domain."""
        soup = BeautifulSoup(html, "html.parser")
        base_domain = urlparse(base_url).netloc
        links: list[str] = []
        seen: set[str] = set()
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            # Skip anchors, javascript, mailto
            if href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            abs_url = urljoin(base_url, href)
            # Strip fragment
            abs_url = abs_url.split("#")[0]
            parsed = urlparse(abs_url)
            if parsed.netloc == base_domain and abs_url not in seen:
                seen.add(abs_url)
                links.append(abs_url)
        return links

    async def _fetch_page(self, url: str, timeout: float = 20.0) -> tuple[bool, str, str]:
        """Fetch a URL, return (success, html_or_error, final_url)."""
        url = self._normalize_url(url)
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                limits=httpx.Limits(max_connections=10)
            ) as client:
                response = await client.get(url, headers=self._HTTP_HEADERS)
                response.raise_for_status()
            return True, response.text, str(response.url)
        except httpx.HTTPStatusError as e:
            return False, f"HTTP {e.response.status_code}: {e.response.reason_phrase}", url
        except httpx.TimeoutException:
            return False, "Request timed out", url
        except Exception as e:
            return False, str(e), url

    # ─── 1. web_search (existing) ─────────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "web_search",
            "description": """Search the web for up-to-date information using DuckDuckGo (free, no API key).

Returns search results including titles, URLs, and descriptions. Supports both single queries and batch queries (array) for concurrent execution.

CRITICAL REQUIREMENT - After answering the user's question, you MUST include a "Sources:" section listing all relevant URLs from the search results as markdown hyperlinks: [Title](URL)

Usage notes:
- Supports both single queries and batch queries (array) for concurrent execution
- IMPORTANT: Use the current year in search queries when searching for recent information
- For batch searches, pass query as a native array of strings, NOT as a JSON string.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "oneOf": [
                            {
                                "type": "string",
                                "description": "A single search query to find relevant web pages."
                            },
                            {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                },
                                "description": "Multiple search queries to execute concurrently. Pass as a native array of strings, NOT as a JSON string."
                            }
                        ],
                        "description": "**REQUIRED** - The search query. Either a single query (string) or multiple queries (array) to execute concurrently."
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "**OPTIONAL** - Number of search results to return per query (1-20). Default: 5.",
                        "default": 5
                    }
                },
                "required": ["query"],
                "additionalProperties": False
            }
        }
    })
    async def web_search(
        self,
        query: str | list[str],
        num_results: int = 5
    ) -> ToolResult:
        """
        Search the web using DuckDuckGo to find relevant and up-to-date information.
        Supports both single queries and batch queries for concurrent execution.
        Free — no API key needed.
        """
        try:
            # Normalize num_results
            if num_results is None:
                num_results = 5
            elif isinstance(num_results, int):
                num_results = max(1, min(num_results, 20))
            elif isinstance(num_results, str):
                try:
                    num_results = max(1, min(int(num_results), 20))
                except ValueError:
                    num_results = 5
            else:
                num_results = 5

            # Handle JSON-encoded array strings
            if isinstance(query, str) and query.strip().startswith('['):
                try:
                    parsed_query = json.loads(query)
                    if isinstance(parsed_query, list):
                        query = parsed_query
                except (json.JSONDecodeError, ValueError):
                    pass

            is_batch = isinstance(query, list)

            if is_batch:
                if not query or len(query) == 0:
                    return self.fail_response("At least one search query is required in the batch.")

                queries = [q.strip() for q in query if q and isinstance(q, str) and q.strip()]
                if not queries:
                    return self.fail_response("No valid search queries provided in the batch.")

                logging.info(f"[WebSearch] Executing batch DuckDuckGo search for {len(queries)} queries with {num_results} results each")

                start_time = time.time()
                tasks = [
                    self._execute_single_search(q, num_results)
                    for q in queries
                ]
                search_results = await asyncio.gather(*tasks, return_exceptions=True)
                elapsed_time = time.time() - start_time
                logging.info(f"[WebSearch] Batch search completed in {elapsed_time:.2f}s")

                batch_response = {
                    "batch_mode": True,
                    "total_queries": len(queries),
                    "elapsed_time": round(elapsed_time, 2),
                    "results": []
                }

                all_successful = True
                for i, result in enumerate(search_results):
                    if isinstance(result, Exception):
                        logging.error(f"[WebSearch] Error processing query '{queries[i]}': {str(result)}")
                        batch_response["results"].append({
                            "query": queries[i],
                            "success": False,
                            "error": str(result),
                            "results": []
                        })
                        all_successful = False
                    else:
                        batch_response["results"].append({
                            "query": queries[i],
                            "success": result.get("success", False),
                            "results": result.get("results", [])
                        })
                        if not result.get("success", False):
                            all_successful = False

                return ToolResult(
                    success=all_successful,
                    output=json.dumps(batch_response, ensure_ascii=False)
                )
            else:
                if not query or not isinstance(query, str):
                    return self.fail_response("A valid search query is required.")

                query = query.strip()
                if not query:
                    return self.fail_response("A valid search query is required.")

                logging.info(f"[WebSearch] Executing DuckDuckGo search for: '{query}' with {num_results} results")
                start_time = time.time()
                result = await self._execute_single_search(query, num_results)
                elapsed_time = time.time() - start_time

                result["elapsed_time"] = round(elapsed_time, 2)

                if result.get("success", False):
                    return ToolResult(
                        success=True,
                        output=json.dumps(result, ensure_ascii=False)
                    )
                else:
                    return ToolResult(
                        success=False,
                        output=json.dumps(result, ensure_ascii=False)
                    )

        except Exception as e:
            error_message = str(e)
            query_str = ", ".join(query) if isinstance(query, list) else str(query)
            logging.error(f"[WebSearch] Error performing web search for '{query_str}': {error_message}")
            return self.fail_response(f"Error performing web search: {error_message[:200]}")

    async def _execute_single_search(self, query: str, num_results: int) -> dict:
        """
        Execute a single search query via SearXNG (self-hosted meta search).
        Falls back to DuckDuckGo if SearXNG is unavailable.
        """
        # Try SearXNG first (self-hosted, no rate limits)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.SEARXNG_URL}/search",
                    params={"q": query, "format": "json", "pageno": 1},
                )
                response.raise_for_status()
                data = response.json()

            raw_results = data.get("results", [])
            if not raw_results:
                return await self._ddg_fallback_search(query, num_results)

            results = []
            for r in raw_results[:num_results]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "engine": r.get("engine", ""),
                })

            logging.info(f"[WebSearch] SearXNG returned {len(results)} results for: '{query}'")
            return {"success": True, "query": query, "results": results, "source": "searxng"}

        except Exception as e:
            logging.warning(f"[WebSearch] SearXNG error for '{query}': {e}, falling back to DuckDuckGo")
            return await self._ddg_fallback_search(query, num_results)

    async def _ddg_fallback_search(self, query: str, num_results: int) -> dict:
        """Fallback to DuckDuckGo if SearXNG is unavailable."""
        try:
            from ddgs import DDGS

            def _do_search():
                with DDGS() as ddgs:
                    return list(ddgs.text(query, max_results=num_results))

            raw_results = await asyncio.to_thread(_do_search)
            if not raw_results:
                return {"success": False, "query": query, "results": [], "message": f"No results found for: {query}"}

            results = []
            for r in raw_results:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "content": r.get("body", ""),
                })

            logging.info(f"[WebSearch] DuckDuckGo fallback returned {len(results)} results for: '{query}'")
            return {"success": True, "query": query, "results": results, "source": "duckduckgo"}

        except Exception as e:
            logging.error(f"[WebSearch] DuckDuckGo fallback also failed for '{query}': {e}")
            return {"success": False, "query": query, "results": [], "error": str(e)}

    # ─── 2. scrape_webpage (existing) ──────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "scrape_webpage",
            "description": """Fetch and extract text content from web pages.

Uses httpx + BeautifulSoup to download pages and extract clean text content. Free, no API key needed.
Removes scripts, styles, navigation, and other clutter. Returns clean readable text.

Usage notes:
- The URLs must be fully-formed valid URLs.
- HTTP URLs will be automatically upgraded to HTTPS.
- Content is truncated to ~12000 characters per page to fit in context.
- Batch multiple URLs in a single call for efficiency.
- For GitHub URLs, prefer using the gh CLI via Bash instead.

IMPORTANT: Collect multiple relevant URLs from web-search results and scrape them all in a single call for efficiency.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "string",
                        "description": "**REQUIRED** - URLs to scrape, separated by commas. Example: 'https://example.com/page1,https://example.com/page2'"
                    }
                },
                "required": ["urls"],
                "additionalProperties": False
            }
        }
    })
    async def scrape_webpage(
        self,
        urls: str
    ) -> ToolResult:
        """
        Retrieve and extract text content from web pages.
        Uses httpx + BeautifulSoup — free, no API key needed.
        """
        try:
            if not urls:
                return self.fail_response("Valid URLs are required.")

            url_list = [url.strip() for url in urls.split(',') if url.strip()]
            if not url_list:
                return self.fail_response("No valid URLs provided.")

            logging.info(f"[WebSearch] Scraping {len(url_list)} URLs")

            start_time = time.time()
            tasks = [self._scrape_single_url(url) for url in url_list]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            elapsed_time = time.time() - start_time
            logging.info(f"[WebSearch] Scraped {len(url_list)} URLs in {elapsed_time:.2f}s")

            processed_results = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logging.error(f"[WebSearch] Error scraping {url_list[i]}: {str(result)}")
                    processed_results.append({
                        "url": url_list[i],
                        "success": False,
                        "error": str(result)
                    })
                else:
                    processed_results.append(result)

            successful = sum(1 for r in processed_results if r.get("success", False))
            failed = len(processed_results) - successful

            if successful == 0:
                error_details = "; ".join([
                    f"{r.get('url')}: {r.get('error', 'Unknown error')}"
                    for r in processed_results
                ])
                return self.fail_response(f"Failed to scrape all {len(processed_results)} URLs. Errors: {error_details}")

            # Build output with scraped content inline
            output_parts = []
            for r in processed_results:
                if r.get("success"):
                    output_parts.append(
                        f"--- Page: {r.get('title', 'No title')} ---\n"
                        f"URL: {r.get('url')}\n\n"
                        f"{r.get('content', '')}\n"
                    )
                else:
                    output_parts.append(
                        f"--- FAILED: {r.get('url')} ---\n"
                        f"Error: {r.get('error', 'Unknown error')}\n"
                    )

            summary = f"Scraped {successful}/{len(processed_results)} URLs in {elapsed_time:.2f}s\n\n"
            output = summary + "\n".join(output_parts)

            return ToolResult(
                success=True,
                output=output
            )

        except Exception as e:
            error_message = str(e)
            logging.error(f"[WebSearch] Error in scrape_webpage: {error_message}")
            return self.fail_response(f"Error processing scrape request: {error_message[:200]}")

    async def _scrape_single_url(self, url: str) -> dict:
        """
        Scrape a single URL and return extracted text content.
        """
        url = self._normalize_url(url)
        logging.info(f"[WebSearch] Scraping: {url}")

        ok, html_or_err, final_url = await self._fetch_page(url)
        if not ok:
            return {"url": url, "success": False, "error": html_or_err}

        title, text = self._extract_text_from_html(html_or_err)
        logging.info(f"[WebSearch] Scraped {url}: title='{title}', {len(text)} chars")

        return {
            "url": final_url,
            "success": True,
            "title": title,
            "content": text,
            "content_length": len(text)
        }

    # ─── 3. deep_research (NEW) ───────────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "deep_research",
            "description": """Perform deep research on a topic by searching DuckDuckGo and then scraping the top results.

Combines search + scrape into a single action for comprehensive research. Searches for the query,
then fetches and extracts content from the top 3-5 results, returning a combined research output.

Best for complex questions that need information from multiple sources. Returns structured output
with content from each source clearly attributed.

Usage notes:
- Use for topics that need comprehensive, multi-source answers
- max_pages controls how many search results to scrape (default: 3, max: 5)
- Each page is truncated to ~8000 chars to fit multiple sources in context
- Returns all sources with URLs for citation""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "**REQUIRED** - The research query / topic to investigate."
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "**OPTIONAL** - Number of top search results to scrape (1-5). Default: 3.",
                        "default": 3
                    }
                },
                "required": ["query"],
                "additionalProperties": False
            }
        }
    })
    async def deep_research(
        self,
        query: str,
        max_pages: int = 3
    ) -> ToolResult:
        """Search + scrape top results for comprehensive research on a topic."""
        try:
            if not query or not isinstance(query, str) or not query.strip():
                return self.fail_response("A valid research query is required.")
            query = query.strip()

            # Clamp max_pages
            if not isinstance(max_pages, int):
                try:
                    max_pages = int(max_pages)
                except (ValueError, TypeError):
                    max_pages = 3
            max_pages = max(1, min(max_pages, 5))

            logging.info(f"[WebSearch] Deep research: '{query}', max_pages={max_pages}")
            start_time = time.time()

            result = await self._deep_research(query, max_pages)

            elapsed_time = time.time() - start_time
            logging.info(f"[WebSearch] Deep research completed in {elapsed_time:.2f}s")

            return ToolResult(success=True, output=result)

        except Exception as e:
            logging.error(f"[WebSearch] Deep research error: {e}")
            return self.fail_response(f"Deep research error: {str(e)[:200]}")

    async def _deep_research(self, query: str, max_pages: int = 3) -> str:
        """Search + scrape top results for comprehensive research."""
        # 1. Search DuckDuckGo
        search_result = await self._execute_single_search(query, num_results=max_pages + 2)
        if not search_result.get("success"):
            return f"Search failed for '{query}': {search_result.get('error', 'No results')}"

        results = search_result.get("results", [])
        if not results:
            return f"No search results found for: {query}"

        # 2. Scrape top N pages concurrently
        urls_to_scrape = [r["url"] for r in results[:max_pages] if r.get("url")]
        if not urls_to_scrape:
            # Return search snippets if no URLs
            parts = [f"## Research: {query}\n\nSearch results (snippets only):\n"]
            for r in results:
                parts.append(f"- **{r.get('title', '')}**: {r.get('content', '')}\n  URL: {r.get('url', '')}\n")
            return "\n".join(parts)

        scrape_tasks = []
        for url in urls_to_scrape:
            scrape_tasks.append(self._fetch_page(url))

        scrape_results = await asyncio.gather(*scrape_tasks, return_exceptions=True)

        # 3. Combine into structured research output
        output_parts = [f"## Deep Research: {query}\n"]
        output_parts.append(f"Searched and scraped {len(urls_to_scrape)} sources.\n")

        sources = []
        for i, scrape in enumerate(scrape_results):
            url = urls_to_scrape[i]
            search_entry = results[i] if i < len(results) else {}
            search_title = search_entry.get("title", "")

            if isinstance(scrape, Exception):
                output_parts.append(f"\n### Source {i+1}: {search_title}\n")
                output_parts.append(f"URL: {url}\n")
                output_parts.append(f"*Failed to fetch: {scrape}*\n")
                output_parts.append(f"Search snippet: {search_entry.get('content', 'N/A')}\n")
                continue

            ok, html_or_err, final_url = scrape
            if not ok:
                output_parts.append(f"\n### Source {i+1}: {search_title}\n")
                output_parts.append(f"URL: {url}\n")
                output_parts.append(f"*Failed to fetch: {html_or_err}*\n")
                output_parts.append(f"Search snippet: {search_entry.get('content', 'N/A')}\n")
                continue

            # Use shorter truncation per page to fit multiple sources
            per_page_limit = max(4000, 12000 // max_pages)
            title, text = self._extract_text_from_html(html_or_err, max_chars=per_page_limit)
            display_title = title or search_title or "Untitled"

            output_parts.append(f"\n### Source {i+1}: {display_title}\n")
            output_parts.append(f"URL: {final_url}\n\n")
            output_parts.append(text)
            output_parts.append("\n")

            sources.append({"title": display_title, "url": final_url})

        # Add sources section
        if sources:
            output_parts.append("\n---\n## Sources\n")
            for s in sources:
                output_parts.append(f"- [{s['title']}]({s['url']})\n")

        return "\n".join(output_parts)

    # ─── 4. crawl_site (NEW) ──────────────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "crawl_site",
            "description": """Crawl a website: start from a URL, follow links within the same domain, and extract content from discovered pages.

Useful for exploring documentation sites, blogs, or any website where you need content from multiple linked pages.

Usage notes:
- Only follows links within the same domain (no external links)
- max_depth controls how many levels deep to follow links (default: 1)
- max_pages limits total pages fetched (default: 5, max: 10)
- Content from each page is truncated to fit in context
- Returns content from all successfully crawled pages""",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "**REQUIRED** - The starting URL to begin crawling from."
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "**OPTIONAL** - How many link-levels deep to crawl (0 = start page only, 1 = start + linked pages). Default: 1, max: 2.",
                        "default": 1
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "**OPTIONAL** - Maximum total pages to fetch. Default: 5, max: 10.",
                        "default": 5
                    }
                },
                "required": ["url"],
                "additionalProperties": False
            }
        }
    })
    async def crawl_site(
        self,
        url: str,
        max_depth: int = 1,
        max_pages: int = 5
    ) -> ToolResult:
        """Crawl a site: start URL, follow links, extract content."""
        try:
            if not url or not isinstance(url, str) or not url.strip():
                return self.fail_response("A valid URL is required.")
            url = url.strip()

            # Clamp params
            if not isinstance(max_depth, int):
                try:
                    max_depth = int(max_depth)
                except (ValueError, TypeError):
                    max_depth = 1
            max_depth = max(0, min(max_depth, 2))

            if not isinstance(max_pages, int):
                try:
                    max_pages = int(max_pages)
                except (ValueError, TypeError):
                    max_pages = 5
            max_pages = max(1, min(max_pages, 10))

            logging.info(f"[WebSearch] Crawl: '{url}', depth={max_depth}, max_pages={max_pages}")
            start_time = time.time()

            result = await self._crawl(url, max_depth, max_pages)

            elapsed_time = time.time() - start_time
            logging.info(f"[WebSearch] Crawl completed in {elapsed_time:.2f}s")

            return ToolResult(success=True, output=result)

        except Exception as e:
            logging.error(f"[WebSearch] Crawl error: {e}")
            return self.fail_response(f"Crawl error: {str(e)[:200]}")

    async def _crawl(self, url: str, max_depth: int = 1, max_pages: int = 5) -> str:
        """Crawl a site: start URL, follow links, extract content."""
        url = self._normalize_url(url)
        base_domain = urlparse(url).netloc

        visited: set[str] = set()
        # Queue: list of (url, depth)
        queue: list[tuple[str, int]] = [(url, 0)]
        pages_fetched: list[dict] = []

        while queue and len(pages_fetched) < max_pages:
            current_url, depth = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            ok, html_or_err, final_url = await self._fetch_page(current_url)
            if not ok:
                pages_fetched.append({
                    "url": current_url,
                    "success": False,
                    "error": html_or_err
                })
                continue

            per_page_limit = max(3000, 12000 // max_pages)
            title, text = self._extract_text_from_html(html_or_err, max_chars=per_page_limit)
            pages_fetched.append({
                "url": final_url,
                "success": True,
                "title": title,
                "content": text,
                "depth": depth
            })

            # Discover links for next depth level
            if depth < max_depth and len(pages_fetched) < max_pages:
                links = self._extract_links_from_html(html_or_err, final_url)
                for link in links:
                    if link not in visited and len(queue) + len(pages_fetched) < max_pages * 3:
                        queue.append((link, depth + 1))

        # Build output
        successful = [p for p in pages_fetched if p.get("success")]
        failed = [p for p in pages_fetched if not p.get("success")]

        output_parts = [f"## Site Crawl: {url}\n"]
        output_parts.append(f"Crawled {len(successful)} pages successfully, {len(failed)} failed.\n")
        output_parts.append(f"Domain: {base_domain}\n")

        for i, page in enumerate(successful):
            output_parts.append(f"\n### Page {i+1} (depth {page.get('depth', 0)}): {page.get('title', 'Untitled')}\n")
            output_parts.append(f"URL: {page['url']}\n\n")
            output_parts.append(page.get("content", ""))
            output_parts.append("\n")

        if failed:
            output_parts.append("\n### Failed pages\n")
            for f_page in failed:
                output_parts.append(f"- {f_page['url']}: {f_page.get('error', 'Unknown error')}\n")

        return "\n".join(output_parts)

    # ─── 5. news_search (NEW) ─────────────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "news_search",
            "description": """Search recent news using DuckDuckGo News. Free, no API key needed.

Returns recent news articles with titles, URLs, descriptions, dates, and sources.
Best for finding current events, breaking news, and recent developments.

Usage notes:
- Returns news-specific results (more recent than regular search)
- max_results controls number of results (default: 5, max: 20)
- Results include publication date and source name""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "**REQUIRED** - The news search query."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "**OPTIONAL** - Number of news results to return (1-20). Default: 5.",
                        "default": 5
                    }
                },
                "required": ["query"],
                "additionalProperties": False
            }
        }
    })
    async def news_search(
        self,
        query: str,
        max_results: int = 5
    ) -> ToolResult:
        """Search recent news using DuckDuckGo News."""
        try:
            if not query or not isinstance(query, str) or not query.strip():
                return self.fail_response("A valid news search query is required.")
            query = query.strip()

            if not isinstance(max_results, int):
                try:
                    max_results = int(max_results)
                except (ValueError, TypeError):
                    max_results = 5
            max_results = max(1, min(max_results, 20))

            logging.info(f"[WebSearch] News search: '{query}', max_results={max_results}")
            start_time = time.time()

            result = await self._news_search(query, max_results)

            elapsed_time = time.time() - start_time
            logging.info(f"[WebSearch] News search completed in {elapsed_time:.2f}s")

            return ToolResult(
                success=True,
                output=json.dumps(result, ensure_ascii=False)
            )

        except Exception as e:
            logging.error(f"[WebSearch] News search error: {e}")
            return self.fail_response(f"News search error: {str(e)[:200]}")

    async def _news_search(self, query: str, max_results: int = 5) -> dict:
        """Search recent news using SearXNG with news category. Falls back to DuckDuckGo News."""
        # Try SearXNG news category first
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.SEARXNG_URL}/search",
                    params={"q": query, "format": "json", "categories": "news", "pageno": 1},
                )
                response.raise_for_status()
                data = response.json()

            raw_results = data.get("results", [])
            if raw_results:
                results = []
                for r in raw_results[:max_results]:
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "body": r.get("content", ""),
                        "date": r.get("publishedDate", ""),
                        "source": r.get("engine", ""),
                    })

                logging.info(f"[WebSearch] SearXNG news returned {len(results)} results for: '{query}'")
                return {"success": True, "query": query, "type": "news", "results": results, "source": "searxng"}
        except Exception as e:
            logging.warning(f"[WebSearch] SearXNG news error for '{query}': {e}")

        # Fallback to DuckDuckGo News
        try:
            from ddgs import DDGS

            def _do_news_search():
                with DDGS() as ddgs:
                    return list(ddgs.news(query, max_results=max_results))

            raw_results = await asyncio.to_thread(_do_news_search)
            if not raw_results:
                return {"success": False, "query": query, "results": [], "message": f"No news results found for: {query}"}

            results = []
            for r in raw_results:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", "") or r.get("href", ""),
                    "body": r.get("body", ""),
                    "date": r.get("date", ""),
                    "source": r.get("source", ""),
                })

            logging.info(f"[WebSearch] DuckDuckGo news fallback returned {len(results)} results for: '{query}'")
            return {"success": True, "query": query, "type": "news", "results": results, "source": "duckduckgo"}

        except Exception as e:
            logging.error(f"[WebSearch] News search completely failed for '{query}': {e}")
            return {"success": False, "query": query, "results": [], "error": str(e)}

    # ─── 6. render_js_page (NEW) ──────────────────────────────────────

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "render_js_page",
            "description": """Render a JavaScript-heavy web page using headless Chromium (Playwright).

Some pages (SPAs, dynamic sites) require JavaScript to render content. This tool uses
a headless browser to fully render the page before extracting text.

Falls back to regular httpx scraping if Playwright is not available.

Usage notes:
- Slower than scrape_webpage (~5-15s per page) but handles JS-rendered content
- Use only when scrape_webpage returns empty/incomplete content
- Content is truncated to ~12000 characters
- Single URL per call (use scrape_webpage for batch)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "**REQUIRED** - The URL of the JS-heavy page to render."
                    }
                },
                "required": ["url"],
                "additionalProperties": False
            }
        }
    })
    async def render_js_page(
        self,
        url: str
    ) -> ToolResult:
        """Render a JS-heavy page using headless Chromium, with httpx fallback."""
        try:
            if not url or not isinstance(url, str) or not url.strip():
                return self.fail_response("A valid URL is required.")
            url = url.strip()

            logging.info(f"[WebSearch] Render JS page: '{url}'")
            start_time = time.time()

            result = await self._render_js(url)

            elapsed_time = time.time() - start_time
            logging.info(f"[WebSearch] Render JS completed in {elapsed_time:.2f}s")

            return ToolResult(success=True, output=result)

        except Exception as e:
            logging.error(f"[WebSearch] Render JS error: {e}")
            return self.fail_response(f"Render JS error: {str(e)[:200]}")

    async def _render_js(self, url: str) -> str:
        """Render a JS-heavy page using crawl4ai (Playwright-based) for clean Markdown output."""
        url = self._normalize_url(url)
        # Try crawl4ai first (clean Markdown output, JS rendering)
        try:
            from crawl4ai import AsyncWebCrawler
            async with AsyncWebCrawler(headless=True, verbose=False) as crawler:
                result = await crawler.arun(url=url)
                if result.success and result.markdown:
                    md = result.markdown
                    if len(md) > 12000:
                        md = md[:12000] + "\n\n[Content truncated at 12000 characters]"
                    return f"JS-Rendered page: {url}\nTitle: {result.title or 'Untitled'}\n\n{md}"
        except ImportError:
            logging.warning("[WebSearch] crawl4ai not installed, trying Playwright directly")
        except Exception as e:
            logging.warning(f"[WebSearch] crawl4ai failed ({e}), trying Playwright directly")

        # Fallback to raw Playwright
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto(url, timeout=15000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    pass
                content = await page.content()
                await browser.close()

            title, text = self._extract_text_from_html(content)
            return f"JS-Rendered page: {url}\nTitle: {title}\n\n{text}"

        except ImportError:
            logging.warning("[WebSearch] Playwright not installed, falling back to httpx scraping")
            return await self._fallback_scrape(url, reason="Playwright not installed")
        except Exception as e:
            logging.warning(f"[WebSearch] Playwright failed ({e}), falling back to httpx scraping")
            return await self._fallback_scrape(url, reason=str(e))

    async def _fallback_scrape(self, url: str, reason: str = "") -> str:
        """Fallback to httpx scraping when Playwright is unavailable."""
        ok, html_or_err, final_url = await self._fetch_page(url)
        if not ok:
            return f"Failed to fetch {url}: {html_or_err}" + (f"\n(Playwright fallback reason: {reason})" if reason else "")

        title, text = self._extract_text_from_html(html_or_err)
        header = f"Page: {url} (fetched with httpx — JS may not be rendered)"
        if reason:
            header += f"\nNote: Playwright unavailable ({reason}), used httpx fallback"
        return f"{header}\nTitle: {title}\n\n{text}"
