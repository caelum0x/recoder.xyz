from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Any
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
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
    body: Optional[dict[str, Any]] = None
    query_params: Optional[dict[str, str]] = None


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

        return {
            "status_code": response.status_code,
            "response_time_ms": elapsed_ms,
            "body": response_body,
            "headers": response_headers,
            "method": method,
            "path": path,
        }
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
