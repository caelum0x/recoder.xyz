from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional, Any
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger
import httpx
import time

router = APIRouter(tags=["api-playground"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ExecuteRequest(BaseModel):
    method: str  # GET, POST, PUT, PATCH, DELETE
    path: str  # e.g. /v1/agents
    headers: Optional[dict[str, str]] = None
    body: Optional[dict[str, Any]] = None
    query_params: Optional[dict[str, str]] = None


class UpdateHistoryEntry(BaseModel):
    name: Optional[str] = None
    is_saved: Optional[bool] = None


class EndpointInfo(BaseModel):
    method: str
    path: str
    summary: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = []
    parameters: list[dict[str, Any]] = []
    request_body: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/playground/endpoints", summary="List available API endpoints")
async def list_endpoints(
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    List all available API endpoints extracted from the FastAPI OpenAPI schema.
    Returns endpoint method, path, summary, description, tags, parameters, and request body schema.
    """
    try:
        app = request.app
        openapi_schema = app.openapi()

        endpoints: list[dict] = []
        paths = openapi_schema.get("paths", {})

        for path, methods in paths.items():
            for method, details in methods.items():
                if method in ("get", "post", "put", "patch", "delete"):
                    # Extract parameters
                    params = []
                    for param in details.get("parameters", []):
                        params.append({
                            "name": param.get("name"),
                            "in": param.get("in"),  # path, query, header
                            "required": param.get("required", False),
                            "description": param.get("description", ""),
                            "schema": param.get("schema", {}),
                        })

                    # Extract request body schema
                    request_body = None
                    rb = details.get("requestBody")
                    if rb:
                        content = rb.get("content", {})
                        json_schema = content.get("application/json", {}).get("schema", {})
                        # Resolve $ref if present
                        if "$ref" in json_schema:
                            ref_path = json_schema["$ref"].replace("#/", "").split("/")
                            resolved = openapi_schema
                            for part in ref_path:
                                resolved = resolved.get(part, {})
                            json_schema = resolved
                        request_body = json_schema

                    endpoints.append({
                        "method": method.upper(),
                        "path": path,
                        "summary": details.get("summary", ""),
                        "description": details.get("description", ""),
                        "tags": details.get("tags", []),
                        "parameters": params,
                        "request_body": request_body,
                        "operation_id": details.get("operationId", ""),
                    })

        # Sort by tag then path
        endpoints.sort(key=lambda e: (e["tags"][0] if e["tags"] else "zzz", e["path"], e["method"]))

        return {"endpoints": endpoints, "total": len(endpoints)}
    except Exception as e:
        logger.error(f"Failed to list endpoints: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve API endpoints")


@router.post("/playground/execute", summary="Execute an API request")
async def execute_request(
    body: ExecuteRequest,
    request: Request,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """
    Proxy endpoint that executes an API request internally and returns the response.
    Uses the caller's auth context.
    """
    allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE"}
    method = body.method.upper()

    if method not in allowed_methods:
        raise HTTPException(status_code=400, detail=f"Method must be one of: {', '.join(allowed_methods)}")

    # Ensure path starts with /v1/
    path = body.path
    if not path.startswith("/"):
        path = f"/{path}"
    if not path.startswith("/v1/"):
        path = f"/v1{path}"

    # Block recursive playground calls
    if "/playground/" in path:
        raise HTTPException(status_code=400, detail="Cannot make playground requests to playground endpoints")

    # Build the internal URL
    # Use the request's host and scheme to call ourselves
    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}{path}"

    if body.query_params:
        query_string = "&".join(f"{k}={v}" for k, v in body.query_params.items())
        url = f"{url}?{query_string}"

    # Forward the authorization header
    auth_header = request.headers.get("authorization", "")
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
    }

    start_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            response = await client.request(
                method=method,
                url=url,
                json=body.body if body.body and method in ("POST", "PUT", "PATCH") else None,
                headers=headers,
            )

        elapsed_ms = int((time.time() - start_time) * 1000)

        # Try to parse response as JSON
        try:
            response_body = response.json()
        except Exception:
            response_body = response.text

        # Extract response headers (limit to useful ones)
        response_headers = {}
        for key in ("content-type", "x-trace-id", "x-request-id", "x-ratelimit-remaining"):
            val = response.headers.get(key)
            if val:
                response_headers[key] = val

        result = {
            "status_code": response.status_code,
            "response_time_ms": elapsed_ms,
            "body": response_body,
            "headers": response_headers,
            "method": method,
            "path": path,
        }

        # Record in history
        try:
            await execute_mutate(
                """
                INSERT INTO api_playground_history
                    (user_id, method, endpoint, headers, body, response_status, response_body, response_time_ms)
                VALUES
                    (:user_id, :method, :endpoint, :headers, :body, :response_status, :response_body, :response_time_ms)
                """,
                {
                    "user_id": user_id,
                    "method": method,
                    "endpoint": path,
                    "headers": body.headers or {},
                    "body": body.body,
                    "response_status": response.status_code,
                    "response_body": response_body if isinstance(response_body, dict) else {"text": str(response_body)},
                    "response_time_ms": elapsed_ms,
                },
            )
        except Exception as rec_err:
            logger.warning(f"Failed to record playground history: {rec_err}")

        return result
    except httpx.TimeoutException:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "status_code": 504,
            "response_time_ms": elapsed_ms,
            "body": {"detail": "Request timed out after 30 seconds"},
            "headers": {},
            "method": method,
            "path": path,
        }
    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Playground execute failed: {e}")
        return {
            "status_code": 500,
            "response_time_ms": elapsed_ms,
            "body": {"detail": f"Request failed: {str(e)}"},
            "headers": {},
            "method": method,
            "path": path,
        }


# ---------------------------------------------------------------------------
# History endpoints
# ---------------------------------------------------------------------------

@router.get("/playground/history", summary="List playground request history")
async def list_history(
    saved_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List playground request history for the current user."""
    where_clause = "WHERE user_id = :user_id"
    if saved_only:
        where_clause += " AND is_saved = true"

    rows = await execute(
        f"""
        SELECT id, name, method, endpoint, headers, body,
               response_status, response_body, response_time_ms,
               is_saved, created_at
        FROM api_playground_history
        {where_clause}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {"user_id": user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows]


@router.patch("/playground/history/{entry_id}", summary="Update a history entry")
async def update_history_entry(
    entry_id: str,
    body: UpdateHistoryEntry,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Save/name a playground history entry."""
    existing = await execute_one(
        "SELECT id FROM api_playground_history WHERE id = :id AND user_id = :user_id",
        {"id": entry_id, "user_id": user_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="History entry not found")

    updates = []
    params: dict[str, Any] = {"id": entry_id, "user_id": user_id}

    if body.name is not None:
        updates.append("name = :name")
        params["name"] = body.name
    if body.is_saved is not None:
        updates.append("is_saved = :is_saved")
        params["is_saved"] = body.is_saved

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(updates)
    row = await execute_one(
        f"""
        UPDATE api_playground_history
        SET {set_clause}
        WHERE id = :id AND user_id = :user_id
        RETURNING *
        """,
        params,
        commit=True,
    )
    return dict(row) if row else None


@router.delete("/playground/history/{entry_id}", summary="Delete a history entry")
async def delete_history_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Delete a playground history entry."""
    rows = await execute_mutate(
        """
        DELETE FROM api_playground_history
        WHERE id = :id AND user_id = :user_id
        RETURNING id
        """,
        {"id": entry_id, "user_id": user_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"deleted": True, "id": entry_id}
