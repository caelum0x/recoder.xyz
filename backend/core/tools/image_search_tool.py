from dotenv import load_dotenv
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.utils.config import config
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.services.http_client import get_http_client
import httpx
import json
import logging
import time
from typing import Union, List

@tool_metadata(
    display_name="Image Search",
    description="Find images on the internet for any topic or subject",
    icon="ImageSearch",
    color="bg-fuchsia-100 dark:bg-fuchsia-800/50",
    weight=130,
    visible=True,
    usage_guide="""
### IMAGE SEARCH CAPABILITIES

**CORE FUNCTIONALITY:**
- Search for images using SERPER API
- Retrieve relevant images related to search queries
- **BATCH SEARCHING:** Execute multiple image queries concurrently
- Get comprehensive image results with titles, URLs, and metadata

**BATCH MODE FOR EFFICIENCY:**
- Use image_search with multiple queries for multiple searches
- All queries execute in parallel for faster results
- Returns: `{"batch_results": [{"query": "...", "images": ["url1", "url2"]}, ...]}`

**BEST PRACTICES:**
- Use specific, descriptive queries for better results
- Include topic context in queries (e.g., "[topic name] [specific attribute]")
- Set `num_results` parameter to control how many images per query
- Review image URLs and select most appropriate for your needs
- Download images using shell commands (wget) before using them

**INTEGRATION WITH PRESENTATIONS:**
- Search for topic-specific images (not generic)
- Always include actual topic/brand/product name in queries
- Use batch mode to search for all needed images at once
- Download all images in a single chained command
"""
)
class SandboxImageSearchTool(SandboxToolsBase):
    """Tool for performing image searches using SearXNG (self-hosted) with Serper API fallback."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        load_dotenv()
        import os
        self.searxng_url = os.environ.get("SEARXNG_URL", "http://127.0.0.1:8888")
        self.serper_api_key = config.SERPER_API_KEY

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "image_search",
            "description": "Search for images using SERPER API. Supports both single and batch searches. Returns image URLs for the given search query(s). Perfect for finding visual content, illustrations, photos, or any images related to your search terms. **🚨 PARAMETER NAMES**: Use EXACTLY these parameter names: `query` (REQUIRED), `num_results` (optional).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "oneOf": [
                            {
                                "type": "string",
                                "description": "**REQUIRED** - Single search query. Be specific about what kind of images you're looking for. Example: 'cats playing', 'mountain landscape', 'modern architecture'"
                            },
                            {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "**REQUIRED** - Multiple search queries for batch processing. More efficient for multiple searches when you need to find images for several topics simultaneously. Example: ['cats', 'dogs', 'birds']"
                            }
                        ],
                        "description": "**REQUIRED** - Search query or queries. Single string for one search, array of strings for batch search."
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "**OPTIONAL** - The number of image results to return per query. Default: 12. Maximum: 100. Minimum: 1.",
                        "default": 12,
                        "minimum": 1,
                        "maximum": 100
                    }
                },
                "required": ["query"],
                "additionalProperties": False
            }
        }
    })
    async def image_search(
        self, 
        query: Union[str, List[str]],
        num_results: int = 12
    ) -> ToolResult:
        """
        Search for images using SERPER API and return image URLs.
        
        Supports both single and batch searches:
        """
        is_batch = False
        queries = []

        try:
            # Validate inputs
            if isinstance(query, str):
                if not query or not query.strip():
                    return self.fail_response("A valid search query is required.")
                queries = [query]
            elif isinstance(query, list):
                if not query or not all(isinstance(q, str) and q.strip() for q in query):
                    return self.fail_response("All queries must be valid non-empty strings.")
                is_batch = True
                queries = query
            else:
                return self.fail_response("Query must be either a string or list of strings.")

            if num_results is None:
                num_results = 12
            elif isinstance(num_results, str):
                try:
                    num_results = int(num_results)
                except ValueError:
                    num_results = 12
            num_results = max(1, min(num_results, 100))

            start_time = time.time()

            if is_batch:
                logging.info(f"Executing batch image search for {len(queries)} queries via SearXNG")
                batch_results = []
                for q in queries:
                    image_urls = await self._searxng_image_search(q, num_results)
                    batch_results.append({
                        "query": q,
                        "total_found": len(image_urls),
                        "images": image_urls,
                    })
                    logging.info(f"Found {len(image_urls)} image URLs for query: '{q}'")

                elapsed_time = round(time.time() - start_time, 2)
                result = {
                    "batch_results": batch_results,
                    "total_queries": len(queries),
                    "response_time": elapsed_time,
                }
            else:
                logging.info(f"Executing image search for query: '{queries[0]}' via SearXNG")
                image_urls = await self._searxng_image_search(queries[0], num_results)
                elapsed_time = round(time.time() - start_time, 2)

                if not image_urls:
                    logging.warning(f"No images found for query: '{queries[0]}'")
                    return self.fail_response(f"No images found for query: '{queries[0]}'")

                logging.info(f"Found {len(image_urls)} image URLs for query: '{queries[0]}'")
                result = {
                    "query": queries[0],
                    "total_found": len(image_urls),
                    "images": image_urls,
                    "response_time": elapsed_time,
                }

            return ToolResult(
                success=True,
                output=json.dumps(result, ensure_ascii=False),
            )

        except Exception as e:
            error_message = str(e)
            query_desc = f"batch queries {queries}" if is_batch else f"query '{queries[0]}'"
            logging.error(f"Error performing image search for {query_desc}: {error_message}")
            return self.fail_response(f"Error performing image search: {error_message[:200]}")

    async def _searxng_image_search(self, query: str, num_results: int = 12) -> List[str]:
        """Search for images using self-hosted SearXNG instance."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{self.searxng_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "categories": "images",
                        "pageno": 1,
                    },
                )
                response.raise_for_status()
                data = response.json()

            raw_results = data.get("results", [])
            image_urls = []
            for r in raw_results[:num_results]:
                url = r.get("img_src") or r.get("url") or r.get("thumbnail_src")
                if url and url.startswith("http"):
                    image_urls.append(url)

            return image_urls
        except Exception as e:
            logging.warning(f"[ImageSearch] SearXNG error for '{query}': {e}")
            # Fall back to Serper if configured
            if self.serper_api_key:
                return await self._serper_image_search(query, num_results)
            return []

    async def _serper_image_search(self, query: str, num_results: int = 12) -> List[str]:
        """Fallback: search for images using Serper API."""
        try:
            async with get_http_client() as client:
                response = await client.post(
                    "https://google.serper.dev/images",
                    json={"q": query, "num": num_results},
                    headers={"X-API-KEY": self.serper_api_key, "Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
            return [img["imageUrl"] for img in data.get("images", []) if img.get("imageUrl")]
        except Exception as e:
            logging.error(f"[ImageSearch] Serper fallback error for '{query}': {e}")
            return []
