import os
import asyncio
from typing import List, Dict, Any, Optional

import httpx


class GitHubClient:
    """Simple async client for GitHub REST API.

    Provides methods to fetch open pull requests and issues for a given repository.
    The repository should be specified as "owner/repo" (e.g., "octocat/Hello-World").
    """

    BASE_URL = "https://api.github.com"

    def __init__(self, token: Optional[str] = None, *, retries: int = 3, timeout: float = 10.0):
        """Initialize the client.

        Args:
            token: Personal access token. If ``None`` the token is read from the
                ``GITHUB_TOKEN`` environment variable.
            retries: Number of retry attempts for transient failures.
            timeout: Request timeout in seconds.
        """
        self.token = token or os.getenv("GITHUB_TOKEN")
        if not self.token:
            raise ValueError("GitHub token not provided. Set GITHUB_TOKEN env var or pass token to GitHubClient.")
        self.retries = retries
        self.timeout = timeout
        self.headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json"}

    async def _get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Internal helper to perform GET with simple retry logic.

        Args:
            endpoint: API endpoint path, e.g. ``/repos/owner/repo/pulls``.
            params: Query parameters.
        Returns:
            Parsed JSON response (list of dicts).
        """
        url = f"{self.BASE_URL}{endpoint}"
        attempt = 0
        async with httpx.AsyncClient(headers=self.headers, timeout=self.timeout) as client:
            while attempt < self.retries:
                try:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
                except (httpx.HTTPError, httpx.RequestError) as exc:
                    attempt += 1
                    if attempt >= self.retries:
                        raise exc
                    await asyncio.sleep(2 ** attempt)
        # Should never reach here
        return []

    async def fetch_pull_requests(self, repo: str) -> List[Dict[str, Any]]:
        """Fetch open pull requests for a repository.

        Args:
            repo: Repository identifier in ``owner/repo`` format.
        Returns:
            List of raw PR dictionaries as returned by GitHub.
        """
        endpoint = f"/repos/{repo}/pulls"
        params = {"state": "open"}
        return await self._get(endpoint, params)

    async def fetch_issues(self, repo: str) -> List[Dict[str, Any]]:
        """Fetch open issues for a repository (excluding pull requests).

        GitHub's issues endpoint returns both issues and pull requests; this method
        filters out any entry that contains a ``pull_request`` key.

        Args:
            repo: Repository identifier in ``owner/repo`` format.
        Returns:
            List of raw issue dictionaries.
        """
        endpoint = f"/repos/{repo}/issues"
        params = {"state": "open"}
        results = await self._get(endpoint, params)
        return [item for item in results if "pull_request" not in item]
    async def fetch_pr_reviews(self, repo: str, pr_number: int) -> List[Dict[str, Any]]:
        """Fetch reviews for a specific pull request.

        Args:
            repo: Repository identifier ``owner/repo``.
            pr_number: Pull request number.

        Returns:
            List of review dicts.
        """
        endpoint = f"/repos/{repo}/pulls/{pr_number}/reviews"
        return await self._get(endpoint)

    async def fetch_pr_checks(self, repo: str, commit_sha: str) -> Dict[str, Any]:
        """Fetch check runs for a specific commit (used for PR status).

        Args:
            repo: Repository identifier ``owner/repo``.
            commit_sha: SHA of the commit (typically the PR head SHA).

        Returns:
            Dictionary representing the check‑run response.
        """
        endpoint = f"/repos/{repo}/commits/{commit_sha}/check-runs"
        return await self._get(endpoint)
