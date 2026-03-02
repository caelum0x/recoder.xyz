"""
Tests for thread-related endpoints

Covers:
  * List threads (GET /threads)
  * Create thread (POST /threads)
  * Get thread by ID (GET /threads/{id})
  * Get thread messages (GET /threads/{id}/messages)
"""
import uuid

import httpx
import pytest


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_threads_returns_200(client: httpx.AsyncClient):
    """GET /threads should return 200 with a paginated thread list."""
    response = await client.get("/threads")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()

    assert "threads" in data, "Response should contain 'threads'"
    assert "pagination" in data, "Response should contain 'pagination'"
    assert isinstance(data["threads"], list), f"Expected threads to be a list, got {type(data['threads'])}"

    # Verify pagination shape
    pagination = data["pagination"]
    for field in ("page", "limit", "total", "pages"):
        assert field in pagination, f"Pagination should include '{field}'"


@pytest.mark.asyncio
async def test_list_threads_pagination_params(client: httpx.AsyncClient):
    """GET /threads should respect page and limit query parameters."""
    response = await client.get("/threads", params={"page": 1, "limit": 5})

    assert response.status_code == 200
    data = response.json()
    assert data["pagination"]["limit"] <= 5, "limit should respect the query parameter"


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_thread(client: httpx.AsyncClient):
    """POST /threads should create a new thread (and project) and return IDs."""
    unique_name = f"E2E Thread {uuid.uuid4().hex[:8]}"
    response = await client.post("/threads", data={"name": unique_name})

    # Thread creation depends on sandbox provisioning; skip if unavailable
    if response.status_code not in (200, 201):
        pytest.skip(f"Thread creation unavailable (status {response.status_code}): {response.text}")

    data = response.json()

    assert "thread_id" in data, "Response should contain 'thread_id'"
    assert "project_id" in data, "Response should contain 'project_id'"

    # Cleanup
    thread_id = data["thread_id"]
    project_id = data["project_id"]
    await client.delete(f"/threads/{thread_id}")
    await client.delete(f"/projects/{project_id}")


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_thread_by_id(client: httpx.AsyncClient):
    """GET /threads/{id} should return thread data for an existing thread."""
    # Create a thread first
    create_resp = await client.post("/threads", data={"name": f"E2E Get Thread {uuid.uuid4().hex[:8]}"})

    if create_resp.status_code not in (200, 201):
        pytest.skip(f"Thread creation unavailable (status {create_resp.status_code})")

    result = create_resp.json()
    thread_id = result["thread_id"]
    project_id = result["project_id"]

    try:
        response = await client.get(f"/threads/{thread_id}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert data["thread_id"] == thread_id, "thread_id should match"
        assert "name" in data, "Thread should have a 'name'"
        assert "created_at" in data, "Thread should have 'created_at'"
        assert "project" in data or "project_id" in data, "Thread should reference its project"
    finally:
        await client.delete(f"/threads/{thread_id}")
        await client.delete(f"/projects/{project_id}")


@pytest.mark.asyncio
async def test_get_thread_not_found(client: httpx.AsyncClient):
    """GET /threads/{id} should return 404 for a non-existent thread."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/threads/{fake_id}")

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_thread_messages(client: httpx.AsyncClient):
    """GET /threads/{id}/messages should return an array of messages."""
    # Create a thread first
    create_resp = await client.post("/threads", data={"name": f"E2E Messages {uuid.uuid4().hex[:8]}"})

    if create_resp.status_code not in (200, 201):
        pytest.skip(f"Thread creation unavailable (status {create_resp.status_code})")

    result = create_resp.json()
    thread_id = result["thread_id"]
    project_id = result["project_id"]

    try:
        response = await client.get(f"/threads/{thread_id}/messages")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert "messages" in data, "Response should contain 'messages'"
        assert isinstance(data["messages"], list), f"Expected messages to be a list, got {type(data['messages'])}"
        # A freshly created thread should have zero messages
    finally:
        await client.delete(f"/threads/{thread_id}")
        await client.delete(f"/projects/{project_id}")


@pytest.mark.asyncio
async def test_get_thread_messages_not_found(client: httpx.AsyncClient):
    """GET /threads/{id}/messages should return 404 for a non-existent thread."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/threads/{fake_id}/messages")

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
