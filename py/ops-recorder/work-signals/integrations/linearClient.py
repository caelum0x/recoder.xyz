import os
import asyncio
from typing import List, Dict, Any, Optional

import httpx


ISSUES_QUERY = """
query FetchTeamIssues($teamId: String!, $after: String) {
  team(id: $teamId) {
    issues(
      filter: { state: { type: { nin: ["completed", "cancelled"] } } }
      first: 100
      after: $after
    ) {
      nodes {
        id
        title
        priority
        createdAt
        updatedAt
        url
        state {
          name
          type
        }
        assignee {
          id
          name
          email
        }
        labels {
          nodes {
            name
          }
        }
        relations {
          nodes {
            type
            relatedIssue {
              id
              title
              state {
                name
                type
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
"""


class LinearClient:
    """Async client for the Linear GraphQL API.

    Fetches open issues for a given team, including assignee, labels,
    and relations (used to detect blocked issues).
    """

    ENDPOINT = "https://api.linear.app/graphql"

    def __init__(self, api_key: Optional[str] = None, *, retries: int = 3, timeout: float = 10.0):
        """Initialize the client.

        Args:
            api_key: Linear personal API key. If ``None`` the key is read from
                the ``LINEAR_API_KEY`` environment variable.
            retries: Number of retry attempts for transient failures.
            timeout: Request timeout in seconds.
        """
        self.api_key = api_key or os.getenv("LINEAR_API_KEY")
        if not self.api_key:
            raise ValueError("Linear API key not provided. Set LINEAR_API_KEY env var or pass api_key to LinearClient.")
        self.retries = retries
        self.timeout = timeout
        self.headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
        }

    async def _post(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Internal helper to POST a GraphQL query with retry logic.

        Args:
            payload: Dict with ``query`` and optional ``variables`` keys.
        Returns:
            The ``data`` portion of the GraphQL response.
        Raises:
            httpx.HTTPError: After all retries are exhausted.
            ValueError: If the response contains GraphQL-level errors.
        """
        attempt = 0
        async with httpx.AsyncClient(headers=self.headers, timeout=self.timeout) as client:
            while attempt < self.retries:
                try:
                    response = await client.post(self.ENDPOINT, json=payload)
                    response.raise_for_status()
                    body = response.json()
                    # GraphQL errors are not transient — raise immediately,
                    # do not retry (bad team ID, auth failures, etc.).
                    if "errors" in body:
                        raise ValueError(f"Linear GraphQL errors: {body['errors']}")
                    return body.get("data", {})
                except ValueError:
                    raise
                except (httpx.HTTPError, httpx.RequestError) as exc:
                    attempt += 1
                    if attempt >= self.retries:
                        raise exc
                    await asyncio.sleep(2 ** attempt)
        return {}

    async def fetch_issues(self, team_id: str) -> List[Dict[str, Any]]:
        """Fetch all open issues for a Linear team.

        Handles pagination automatically — keeps fetching until there are no
        more pages.

        Args:
            team_id: The Linear team ID (UUID string).
        Returns:
            Flat list of raw issue dicts as returned by the GraphQL API.
        """
        issues: List[Dict[str, Any]] = []
        cursor: Optional[str] = None

        while True:
            variables: Dict[str, Any] = {"teamId": team_id}
            if cursor:
                variables["after"] = cursor

            data = await self._post({"query": ISSUES_QUERY, "variables": variables})

            team_data = data.get("team", {})
            issues_page = team_data.get("issues", {})
            nodes = issues_page.get("nodes", [])
            issues.extend(nodes)

            page_info = issues_page.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info["endCursor"]
            else:
                break

        return issues
