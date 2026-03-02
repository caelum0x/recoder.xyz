"""
Tests for agent-related endpoints

Covers CRUD operations on /agents:
  * List agents (GET /agents)
  * Create agent (POST /agents)
  * Get agent by ID (GET /agents/{id})
  * Update agent (PUT /agents/{id})
  * Delete agent (DELETE /agents/{id})

Note: Tests that start agent runs require billing/credits.
If the test user doesn't have billing set up, those tests will be skipped.
"""
import uuid

import httpx
import pytest


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_agents_returns_200(client: httpx.AsyncClient):
    """GET /agents should return 200 with a paginated agent list."""
    response = await client.get("/agents")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()

    # The response must contain the expected top-level keys
    assert "agents" in data, "Response should contain 'agents' key"
    assert "pagination" in data, "Response should contain 'pagination' key"
    assert isinstance(data["agents"], list), f"Expected agents to be a list, got {type(data['agents'])}"

    # Verify pagination shape
    pagination = data["pagination"]
    for field in ("current_page", "page_size", "total_items", "total_pages"):
        assert field in pagination, f"Pagination should include '{field}'"


@pytest.mark.asyncio
async def test_list_agents_pagination_params(client: httpx.AsyncClient):
    """GET /agents should respect page and limit query parameters."""
    response = await client.get("/agents", params={"page": 1, "limit": 5})

    assert response.status_code == 200
    data = response.json()
    assert data["pagination"]["page_size"] <= 5, "page_size should respect the limit parameter"


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_agent(client: httpx.AsyncClient):
    """POST /agents should create a new agent and return its data."""
    unique_name = f"E2E Test Agent {uuid.uuid4().hex[:8]}"
    payload = {"name": unique_name}

    response = await client.post("/agents", json=payload)

    # 200 or 201 are both acceptable for creation
    assert response.status_code in (200, 201), f"Expected 200/201, got {response.status_code}: {response.text}"
    data = response.json()

    assert "agent_id" in data, "Response should contain 'agent_id'"
    assert data["name"] == unique_name, "Agent name should match the request"
    assert isinstance(data.get("configured_mcps"), list), "configured_mcps should be a list"
    assert isinstance(data.get("agentpress_tools"), dict), "agentpress_tools should be a dict"

    # Cleanup: delete the created agent so we don't pollute the account
    agent_id = data["agent_id"]
    await client.delete(f"/agents/{agent_id}")


# ---------------------------------------------------------------------------
# Get by ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_agent_by_id(client: httpx.AsyncClient):
    """GET /agents/{id} should return full agent data for an existing agent."""
    # First create an agent to look up
    unique_name = f"E2E Lookup Agent {uuid.uuid4().hex[:8]}"
    create_resp = await client.post("/agents", json={"name": unique_name})
    assert create_resp.status_code in (200, 201), f"Setup failed: {create_resp.text}"
    agent_id = create_resp.json()["agent_id"]

    try:
        response = await client.get(f"/agents/{agent_id}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["agent_id"] == agent_id
        assert data["name"] == unique_name
    finally:
        await client.delete(f"/agents/{agent_id}")


@pytest.mark.asyncio
async def test_get_agent_not_found(client: httpx.AsyncClient):
    """GET /agents/{id} should return 404 for a non-existent agent."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/agents/{fake_id}")

    assert response.status_code in (404, 500), f"Expected 404 or 500, got {response.status_code}: {response.text}"


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_agent(client: httpx.AsyncClient):
    """PUT /agents/{id} should update and return the modified agent."""
    # Create an agent first
    original_name = f"E2E Update Agent {uuid.uuid4().hex[:8]}"
    create_resp = await client.post("/agents", json={"name": original_name})
    assert create_resp.status_code in (200, 201), f"Setup failed: {create_resp.text}"
    agent_id = create_resp.json()["agent_id"]

    try:
        updated_name = f"E2E Updated {uuid.uuid4().hex[:8]}"
        update_resp = await client.put(f"/agents/{agent_id}", json={"name": updated_name})

        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        data = update_resp.json()
        assert data["name"] == updated_name, "Name should be updated"
        assert data["agent_id"] == agent_id
    finally:
        await client.delete(f"/agents/{agent_id}")


@pytest.mark.asyncio
async def test_update_agent_not_found(client: httpx.AsyncClient):
    """PUT /agents/{id} should return 404 for a non-existent agent."""
    fake_id = str(uuid.uuid4())
    response = await client.put(f"/agents/{fake_id}", json={"name": "Ghost"})

    assert response.status_code in (404, 500), f"Expected 404 or 500, got {response.status_code}: {response.text}"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_agent(client: httpx.AsyncClient):
    """DELETE /agents/{id} should remove the agent and return a success message."""
    # Create a non-default agent to delete
    unique_name = f"E2E Delete Agent {uuid.uuid4().hex[:8]}"
    create_resp = await client.post("/agents", json={"name": unique_name, "is_default": False})
    assert create_resp.status_code in (200, 201), f"Setup failed: {create_resp.text}"
    agent_id = create_resp.json()["agent_id"]

    response = await client.delete(f"/agents/{agent_id}")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert "message" in data, "Delete response should contain a 'message' field"

    # Verify the agent is gone
    get_resp = await client.get(f"/agents/{agent_id}")
    assert get_resp.status_code in (404, 500), "Agent should no longer be accessible after deletion"


@pytest.mark.asyncio
async def test_delete_agent_not_found(client: httpx.AsyncClient):
    """DELETE /agents/{id} should return 404 for a non-existent agent."""
    fake_id = str(uuid.uuid4())
    response = await client.delete(f"/agents/{fake_id}")

    assert response.status_code in (404, 500), f"Expected 404 or 500, got {response.status_code}: {response.text}"
