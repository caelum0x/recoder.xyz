"""
Tests for project-related endpoints

Projects are implicitly created when a thread is created (POST /threads).
Available routes:
  * GET /projects/{id}            - Get project details
  * GET /projects/{id}/threads    - List threads in a project
  * DELETE /projects/{id}         - Delete a project

There is no standalone GET /projects list endpoint; projects are
discovered through the threads list.
"""
import uuid

import httpx
import pytest


# ---------------------------------------------------------------------------
# Get project by ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_project_by_id(client: httpx.AsyncClient):
    """GET /projects/{id} should return project data for an existing project."""
    # Create a thread (which also creates a project)
    create_resp = await client.post("/threads", data={"name": f"E2E Project Test {uuid.uuid4().hex[:8]}"})

    # Thread creation may fail in environments without sandbox provisioning
    if create_resp.status_code not in (200, 201):
        pytest.skip(f"Thread creation unavailable (status {create_resp.status_code}), skipping project test")

    result = create_resp.json()
    project_id = result["project_id"]

    try:
        response = await client.get(f"/projects/{project_id}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert data["project_id"] == project_id, "project_id should match"
        assert "name" in data, "Project should have a 'name'"
        assert "created_at" in data, "Project should have 'created_at'"
    finally:
        # Cleanup
        await client.delete(f"/projects/{project_id}")


@pytest.mark.asyncio
async def test_get_project_not_found(client: httpx.AsyncClient):
    """GET /projects/{id} should return 404 for a non-existent project."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/projects/{fake_id}")

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


# ---------------------------------------------------------------------------
# List project threads
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_project_threads(client: httpx.AsyncClient):
    """GET /projects/{id}/threads should return a paginated thread list."""
    # Create a thread to ensure the project has at least one
    create_resp = await client.post("/threads", data={"name": f"E2E ProjThreads {uuid.uuid4().hex[:8]}"})

    if create_resp.status_code not in (200, 201):
        pytest.skip(f"Thread creation unavailable (status {create_resp.status_code}), skipping project threads test")

    result = create_resp.json()
    project_id = result["project_id"]

    try:
        response = await client.get(f"/projects/{project_id}/threads")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert "threads" in data, "Response should contain 'threads'"
        assert "pagination" in data, "Response should contain 'pagination'"
        assert isinstance(data["threads"], list), "threads should be a list"
        assert len(data["threads"]) >= 1, "Project should have at least one thread"
    finally:
        await client.delete(f"/projects/{project_id}")


@pytest.mark.asyncio
async def test_list_project_threads_not_found(client: httpx.AsyncClient):
    """GET /projects/{id}/threads should return 404 for a non-existent project."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/projects/{fake_id}/threads")

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
