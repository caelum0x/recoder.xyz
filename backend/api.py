from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, HTTPException, Response, Depends, APIRouter, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from core.services import redis
from core.utils.openapi_config import configure_openapi
from contextlib import asynccontextmanager
from core.agentpress.thread_manager import ThreadManager
from datetime import datetime, timezone
from core.utils.config import config, EnvMode
import asyncio
from core.utils.logger import logger, structlog
import time
from collections import OrderedDict
import os
import psutil

from pydantic import BaseModel
import uuid

from core.utils.trace_context import (
    build_trace_context_from_headers,
    set_trace_context,
    get_trace_context,
    TraceContext,
)


from core.versioning.api import router as versioning_router
from core.agents.api import router as agent_runs_router
from core.agents.agent_crud import router as agent_crud_router
from core.agents.agent_tools import router as agent_tools_router
from core.agents.agent_json import router as agent_json_router
from core.agents.agent_setup import router as agent_setup_router
from core.agents.analytics_api import router as agent_analytics_router
from core.agents.agent_metrics_api import router as agent_metrics_router
from core.agents.agent_comparison_api import router as agent_comparison_router
from core.agents.execution_logs_api import router as execution_logs_router
from core.agents.agent_secrets_api import router as agent_secrets_router
from core.agents.agent_quota_api import router as agent_quota_router
from core.agents.agent_import_export_api import router as agent_import_export_router
from core.agents.agent_schedule_api import router as agent_schedule_router
from core.agents.agent_ab_test_api import router as agent_ab_test_router
from core.agents.agent_activity_api import router as agent_activity_router
from core.agents.agent_versioning_api import router as agent_versioning_router
from core.agents.agent_benchmark_api import router as agent_benchmark_router
from core.agents.agent_comments_api import router as agent_comments_router
from core.agents.agent_env_vars_api import router as agent_env_vars_router
from core.agents.agent_clone_api import router as agent_clone_router
from core.agents.agent_clone_wizard_api import router as agent_clone_wizard_router
from core.agents.agent_testing_api import router as agent_testing_router
from core.agents.agent_replay_api import router as agent_replay_router
from core.agents.agent_health_api import router as agent_health_router
from core.agents.agent_changelog_api import router as agent_changelog_router
from core.agents.agent_versioned_configs_api import router as agent_versioned_configs_router
from core.prompts.shared_prompts_api import router as shared_prompts_router
from core.threads.api import router as threads_router
from core.threads.thread_templates_api import router as thread_templates_router
from core.threads.thread_pins_api import router as thread_pins_router
from core.threads.thread_search_api import router as thread_search_router
from core.threads.thread_analytics_api import router as thread_analytics_router
from core.threads.thread_tags_api import router as thread_tags_router
from core.threads.message_bookmarks_api import router as message_bookmarks_router
from core.threads.response_ratings_api import router as response_ratings_router
from core.threads.thread_summaries_api import router as thread_summaries_router
from core.threads.thread_search_filters_api import router as thread_search_filters_router
from core.threads.thread_branches_api import router as thread_branches_router
from core.categorization.api import router as categorization_router
from core.endpoints import router as endpoints_router

from core.sandbox import api as sandbox_api
from core.billing.api import router as billing_router
from core.setup import router as setup_router, webhook_router
from core.admin.admin_api import router as admin_router
from core.admin.billing_admin_api import router as billing_admin_router
from core.admin.feedback_admin_api import router as feedback_admin_router
from core.admin.notification_admin_api import router as notification_admin_router
from core.admin.analytics_admin_api import router as analytics_admin_router
from core.admin.stress_test_admin_api import router as stress_test_admin_router
from core.admin.system_status_admin_api import router as system_status_admin_router
from core.admin.sandbox_pool_admin_api import router as sandbox_pool_admin_router
from core.endpoints.system_status_api import router as system_status_router
from core.services import transcription as transcription_api
import sys
from core.triggers import api as triggers_api
from core.services import api_keys_api
from core.services.api_usage_api import router as api_usage_router
from core.notifications import api as notifications_api
from core.services.orphan_cleanup import cleanup_orphaned_agent_runs
from auth import api as auth_api
from auth import mfa_api
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.knowledge.knowledge_graph_api import router as knowledge_graph_router
from core.threads.thread_auto_tagging_api import router as thread_auto_tagging_router
from core.monitoring.error_patterns_api import router as error_patterns_router
from core.agents.agent_sandbox_api import router as agent_sandbox_router
from core.billing.usage_forecasting_api import router as usage_forecasting_router
from core.agents.agent_template_gallery_api import router as agent_template_gallery_router
from core.ai_models.models_api import models_router


if sys.platform == "win32":
    # Use SelectorEventLoop on Windows for psycopg async compatibility
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Use shared instance ID for distributed deployments
from core.utils.instance import get_instance_id, INSTANCE_ID
instance_id = INSTANCE_ID  # Keep backward compatibility


# Rate limiter state
ip_tracker = OrderedDict()
MAX_CONCURRENT_IPS = 25

# Background task handles
_worker_metrics_task = None
_memory_watchdog_task = None
_stream_cleanup_task = None
_metrics_logger_task = None

# Graceful shutdown flag for health checks
# When True, health check will return unhealthy to stop receiving traffic
_is_shutting_down = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_metrics_task, _memory_watchdog_task, _stream_cleanup_task, _metrics_logger_task, _is_shutting_down
    env_mode = config.ENV_MODE.value if config.ENV_MODE else "unknown"
    logger.debug(f"Starting up FastAPI application with instance ID: {instance_id} in {env_mode} mode")
    try:
        db = None
        
        from core.services.db import init_db
        await init_db()

        try:
            from core.services.db import execute_one
            await execute_one("SELECT 1", {})
            logger.debug("Database connection pool warmed up")
        except Exception as e:
            logger.warning(f"Failed to warm up database connection pool: {e}")
        
        # Pre-load tool classes and schemas to avoid first-request delay
        from core.utils.tool_discovery import warm_up_tools_cache
        warm_up_tools_cache()
        
        # Pre-load static Recoder config for fast path in API requests
        from core.cache.runtime_cache import load_static_recoder_config
        load_static_recoder_config()
        
        sandbox_api.initialize(db)
        
        from core.services import redis
        try:
            await redis.initialize_async()
            logger.debug("Redis connection initialized successfully")
            try:
                tier_keys = await redis.scan_keys("tier_info:*")
                sub_keys = await redis.scan_keys("subscription_tier:*")
                all_keys = tier_keys + sub_keys
                if all_keys:
                    for key in all_keys:
                        await redis.delete(key)
                    logger.info(f"[STARTUP] Cleared {len(all_keys)} tier caches to pick up config changes")
            except Exception as e:
                logger.warning(f"[STARTUP] Failed to clear tier caches: {e}")
                
        except Exception as e:
            logger.error(f"Failed to initialize Redis connection: {e}")

        try:
            await cleanup_orphaned_agent_runs()
        except Exception as e:
            logger.error(f"Failed to cleanup orphaned agent runs on startup: {e}")
        
        triggers_api.initialize(db)
        credentials_api.initialize(db)
        template_api.initialize(db)
        composio_api.initialize(db)
        
        # Start CloudWatch worker metrics publisher (production only)
        if config.ENV_MODE == EnvMode.PRODUCTION:
            from core.services import worker_metrics
            _worker_metrics_task = asyncio.create_task(worker_metrics.start_cloudwatch_publisher())
        
        # Start Redis stream cleanup task (catches orphaned streams with no TTL)
        from core.services import worker_metrics
        _stream_cleanup_task = asyncio.create_task(worker_metrics.start_stream_cleanup_task())
        
        # Start memory watchdog for observability
        _memory_watchdog_task = asyncio.create_task(_memory_watchdog())
        
        # Log system metrics to CloudWatch every 5 minutes (logger ships to CloudWatch)
        _metrics_logger_task = asyncio.create_task(_metrics_logger_loop())
        
        # Start sandbox pool service (maintains pre-warmed sandboxes)
        from core.sandbox.pool_background import start_pool_service
        asyncio.create_task(start_pool_service())

        # Start conversation analytics worker
        from core.analytics.conversation_analytics_worker import start_analytics_worker
        asyncio.create_task(start_analytics_worker())
        
        # Initialize stateless pipeline
        from core.agents.pipeline.stateless import lifecycle
        await lifecycle.initialize()
        logger.info("[STARTUP] Stateless pipeline initialized")

        # Start background free-model sync for unified registry
        from core.ai_models.registry import start_free_model_sync
        asyncio.create_task(start_free_model_sync())
        logger.info("[STARTUP] Free model sync background task started")

        yield

        _is_shutting_down = True
        logger.info(f"Starting graceful shutdown for instance {instance_id}")
        
        # Give K8s readiness probe time to detect unhealthy state
        # This ensures no new traffic is routed to this pod
        await asyncio.sleep(2)
        
        # ===== CRITICAL: Stop all running agent runs on this instance =====
        from core.agents.api import _cancellation_events
        from core.agents.runner import update_agent_run_status
        
        active_run_ids = list(_cancellation_events.keys())
        if active_run_ids:
            logger.warning(f"🛑 Stopping {len(active_run_ids)} active agent runs on shutdown: {active_run_ids}")
            
            # Set cancellation events for all running runs
            for agent_run_id in active_run_ids:
                try:
                    event = _cancellation_events.get(agent_run_id)
                    if event:
                        event.set()
                        logger.info(f"Set cancellation event for {agent_run_id}")
                except Exception as e:
                    logger.error(f"Failed to set cancellation event for {agent_run_id}: {e}")
            
            # Give tasks a moment to handle cancellation gracefully
            await asyncio.sleep(1)
            
            # Force update DB status for any runs that didn't clean up
            for agent_run_id in active_run_ids:
                try:
                    # Update status to stopped with shutdown message
                    await update_agent_run_status(
                        agent_run_id,
                        "stopped",
                        error=f"Instance shutdown: {instance_id}"
                    )
                    logger.info(f"✅ Marked agent run {agent_run_id} as stopped (instance shutdown)")
                    
                    # Also set Redis stop signal for any reconnecting clients
                    try:
                        await redis.set_stop_signal(agent_run_id)
                    except Exception:
                        pass
                except Exception as e:
                    logger.error(f"Failed to update agent run {agent_run_id} on shutdown: {e}")
        else:
            logger.info("No active agent runs to stop on shutdown")
        
        # Shutdown stateless pipeline
        from core.agents.pipeline.stateless import lifecycle
        await lifecycle.shutdown()
        logger.info("[SHUTDOWN] Stateless pipeline shutdown complete")
        
        logger.debug("Cleaning up resources")
        
        # Stop CloudWatch worker metrics task
        if _worker_metrics_task is not None:
            _worker_metrics_task.cancel()
            try:
                await _worker_metrics_task
            except asyncio.CancelledError:
                pass
        
        # Stop memory watchdog task
        if _memory_watchdog_task is not None:
            _memory_watchdog_task.cancel()
            try:
                await _memory_watchdog_task
            except asyncio.CancelledError:
                pass

        # Stop metrics logger task
        if _metrics_logger_task is not None:
            _metrics_logger_task.cancel()
            try:
                await _metrics_logger_task
            except asyncio.CancelledError:
                pass

        # Stop sandbox pool service
        from core.sandbox.pool_background import stop_pool_service
        await stop_pool_service()

        # Stop conversation analytics worker
        from core.analytics.conversation_analytics_worker import stop_analytics_worker
        await stop_analytics_worker()
        
        try:
            logger.debug("Closing Redis connection")
            await redis.close()
            logger.debug("Redis connection closed successfully")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")

        logger.debug("Disconnecting from database")
        # Close direct Postgres connection pool
        from core.services.db import close_db
        await close_db()
    except Exception as e:
        logger.error(f"Error during application startup: {e}")
        raise

app = FastAPI(
    title="Recoder Platform API",
    description="Backend API for the Recoder platform — agent management, workflows, analytics, and AI services.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    swagger_ui_parameters={
        "persistAuthorization": True,  # Keep auth between page refreshes
    },
)

# Configure OpenAPI docs with API Key and Bearer token auth
configure_openapi(app)


# ---------------------------------------------------------------------------
# SFA-011: Exception handlers that embed trace fields in error response JSON
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def traced_http_exception_handler(request: Request, exc: HTTPException):
    """Return HTTPException errors with interop trace metadata."""
    trace_ctx: TraceContext | None = get_trace_context()
    # Build the body — preserve the original `detail` structure
    body: dict = {"detail": exc.detail}
    if trace_ctx:
        body["_meta"] = trace_ctx.as_response_meta()

    headers: dict[str, str] = {}
    if trace_ctx:
        headers = trace_ctx.as_response_headers()
    # Merge any headers the exception itself carries (e.g. WWW-Authenticate)
    if exc.headers:
        headers.update(exc.headers)

    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        headers=headers,
    )


@app.exception_handler(Exception)
async def traced_unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions — return 500 with trace metadata.

    Special case: PostgreSQL 'relation does not exist' errors return empty
    results instead of 500, since many tables may not be migrated yet.
    """
    trace_ctx: TraceContext | None = get_trace_context()
    try:
        error_str = str(exc)
    except Exception:
        error_str = f"Error of type {type(exc).__name__}"

    # Graceful degradation for missing tables — return empty data instead of 500
    if "relation" in error_str and "does not exist" in error_str:
        logger.warning(f"Missing table query: {error_str} — returning empty result for {request.url.path}")
        return JSONResponse(
            status_code=200,
            content={"data": [], "items": [], "results": [], "total": 0, "success": True},
        )

    # Graceful degradation for missing columns
    if "column" in error_str and "does not exist" in error_str:
        logger.warning(f"Missing column query: {error_str} — returning empty result for {request.url.path}")
        return JSONResponse(
            status_code=200,
            content={"data": [], "items": [], "results": [], "total": 0, "success": True},
        )

    logger.error(f"Unhandled exception: {error_str}", exc_info=exc)

    body: dict = {"detail": "Internal server error"}
    if trace_ctx:
        body["_meta"] = trace_ctx.as_response_meta()

    headers: dict[str, str] = {}
    if trace_ctx:
        headers = trace_ctx.as_response_headers()

    return JSONResponse(
        status_code=500,
        content=body,
        headers=headers,
    )


@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    structlog.contextvars.clear_contextvars()

    # --- SFA-011: Build trace context from W3C traceparent, X-Trace-Id, etc. ---
    trace_ctx = build_trace_context_from_headers(
        headers={k.lower(): v for k, v in request.headers.items()},
        query_params=dict(request.query_params),
    )
    set_trace_context(trace_ctx)

    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    method = request.method
    path = request.url.path
    query_params = str(request.query_params)

    # Make interop metadata available to route handlers via request.state
    request.state.trace_id = trace_ctx.trace_id
    request.state.request_id = trace_ctx.request_id
    request.state.connector_id = trace_ctx.connector_id
    request.state.trace_context = trace_ctx

    # Bind all interop fields + request metadata into structlog context
    structlog.contextvars.bind_contextvars(
        **trace_ctx.as_log_fields(),
        client_ip=client_ip,
        method=method,
        path=path,
        query_params=query_params,
    )

    # Log the incoming request
    logger.debug(f"Request started: {method} {path} from {client_ip} | Query: {query_params}")

    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        # SFA-011: propagate interop metadata in response headers for cross-service tracing.
        for hdr_name, hdr_value in trace_ctx.as_response_headers().items():
            response.headers[hdr_name] = hdr_value
        logger.debug(f"Request completed: {method} {path} | Status: {response.status_code} | Time: {process_time:.2f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        try:
            error_str = str(e)
        except Exception:
            error_str = f"Error of type {type(e).__name__}"
        logger.error(f"Request failed: {method} {path} | Error: {error_str} | Time: {process_time:.2f}s")
        raise

# Define allowed origins based on environment
allowed_origins = [
    "https://www.recoder.xyz",
    "https://recoder.xyz",
    "https://dev.recoder.xyz",
    "https://staging.recoder.xyz",
    "https://prod-test.recoder.xyz",
]
# Allow all *.recoder.xyz subdomains and Vercel preview deployments
allow_origin_regex = r"https://([a-z0-9-]+\.)?recoder\.xyz|https://.*-recoderxyz\.vercel\.app"

# Add local origins for development
if config.ENV_MODE == EnvMode.LOCAL:
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://127.0.0.1:3000")

# Add staging-specific origins
if config.ENV_MODE == EnvMode.STAGING:
    allowed_origins.append("https://staging.recoder.xyz")
    allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Project-Id",
        "X-MCP-URL",
        "X-MCP-Type",
        "X-MCP-Headers",
        "X-API-Key",
        "X-Trace-Id",
        "X-Connector-Id",
        "X-Request-Id",
        "traceparent",
        "tracestate",
    ],
)

# Create a main API router
api_router = APIRouter()

# Include all API routers without individual prefixes
# Core routers
api_router.include_router(versioning_router)
# ALL agent routers with static /agents/WORD paths MUST come BEFORE agent_crud
# because agent_crud has /agents/{agent_id} which matches any word as an agent_id.
# FastAPI routes are matched in registration order — first match wins.
api_router.include_router(agent_runs_router)          # /agents/active-runs
api_router.include_router(agent_comparison_router)    # /agents/leaderboard, /agents/compare, /agents/comparisons
api_router.include_router(agent_quota_router)         # /agents/quotas/*
api_router.include_router(agent_activity_router)      # /agents/activity/*
api_router.include_router(agent_json_router)          # /agents/json/*
api_router.include_router(agent_setup_router)         # /agents/setup-from-chat
api_router.include_router(agent_import_export_router) # /agents/import
api_router.include_router(agent_clone_router)         # /agents/clone-diff
api_router.include_router(agent_benchmark_router)     # /benchmarks/*
api_router.include_router(agent_ab_test_router)       # ab-tests
api_router.include_router(agent_tools_router)         # /agents/{id}/tools (has {id} but also static)
api_router.include_router(agent_analytics_router)
api_router.include_router(agent_metrics_router)
api_router.include_router(agent_schedule_router)
api_router.include_router(agent_secrets_router)
api_router.include_router(agent_comments_router)
api_router.include_router(agent_env_vars_router)
api_router.include_router(agent_clone_wizard_router)
api_router.include_router(agent_testing_router)
api_router.include_router(agent_replay_router)
api_router.include_router(agent_health_router)
api_router.include_router(agent_changelog_router)
api_router.include_router(agent_versioned_configs_router)
# agent_crud MUST be LAST — it has /agents/{agent_id} catch-all
api_router.include_router(agent_crud_router)
api_router.include_router(execution_logs_router)

from core.agents.agent_deployment_api import router as agent_deployment_router
api_router.include_router(agent_deployment_router)

from core.agents.agent_scheduled_tasks_api import router as agent_scheduled_tasks_router
api_router.include_router(agent_scheduled_tasks_router)

api_router.include_router(shared_prompts_router)
api_router.include_router(thread_pins_router)
api_router.include_router(thread_templates_router)
api_router.include_router(threads_router)
api_router.include_router(thread_search_router)
api_router.include_router(thread_analytics_router)
api_router.include_router(thread_tags_router)
from core.threads.thread_labels_api import router as thread_labels_router
api_router.include_router(thread_labels_router)
api_router.include_router(message_bookmarks_router)
api_router.include_router(response_ratings_router)
api_router.include_router(thread_summaries_router)
api_router.include_router(thread_search_filters_router)
api_router.include_router(thread_branches_router)
from core.threads.thread_export_api import router as thread_export_router
api_router.include_router(thread_export_router)
from core.threads.thread_bulk_api import router as thread_bulk_router
api_router.include_router(thread_bulk_router)
api_router.include_router(categorization_router)
api_router.include_router(endpoints_router)
api_router.include_router(sandbox_api.router)
api_router.include_router(billing_router)

from core.billing.cost_alerts_api import router as cost_alerts_router
api_router.include_router(cost_alerts_router)

from core.billing.quota_dashboard_api import router as quota_dashboard_router
api_router.include_router(quota_dashboard_router)

from core.billing.cost_allocation_api import router as cost_allocation_router
api_router.include_router(cost_allocation_router)

api_router.include_router(setup_router)
api_router.include_router(webhook_router)  # Webhooks at /api/webhooks/*
api_router.include_router(api_keys_api.router)
api_router.include_router(api_usage_router)
api_router.include_router(billing_admin_router)
api_router.include_router(admin_router)
api_router.include_router(feedback_admin_router)
api_router.include_router(notification_admin_router)
api_router.include_router(analytics_admin_router)
api_router.include_router(stress_test_admin_router)
api_router.include_router(system_status_admin_router)
api_router.include_router(sandbox_pool_admin_router)
api_router.include_router(system_status_router)

from core.mcp_module import api as mcp_api
from core.credentials import api as credentials_api
from core.templates import api as template_api
from core.templates import presentations_api

api_router.include_router(mcp_api.router)
api_router.include_router(credentials_api.router, prefix="/secure-mcp")

from core.credentials.credential_audit_api import router as credential_audit_router
api_router.include_router(credential_audit_router)

api_router.include_router(template_api.router, prefix="/templates")
api_router.include_router(presentations_api.router, prefix="/presentation-templates")

api_router.include_router(transcription_api.router)

from core.services import voice_generation as voice_api
api_router.include_router(voice_api.router)

from core.knowledge_base import api as knowledge_base_api
api_router.include_router(knowledge_base_api.router)

from core.knowledge_base.folder_management_api import router as kb_folder_mgmt_router
api_router.include_router(kb_folder_mgmt_router)

api_router.include_router(triggers_api.router)

api_router.include_router(notifications_api.router)

from core.notifications.notification_stream_api import router as notification_stream_router
api_router.include_router(notification_stream_router)

from core.notifications.notification_channels_api import router as notification_channels_router
api_router.include_router(notification_channels_router)

from core.notifications.notification_rules_api import router as notification_rules_router
api_router.include_router(notification_rules_router)

from core.notifications import presence_api
api_router.include_router(presence_api.router)

from core.notifications.notification_digest_api import router as notification_digest_router
api_router.include_router(notification_digest_router)

from core.composio_integration import api as composio_api
api_router.include_router(composio_api.router)

from core.google.google_slides_api import router as google_slides_router
api_router.include_router(google_slides_router)

from core.google.google_docs_api import router as google_docs_router
api_router.include_router(google_docs_router)

from core.referrals import router as referrals_router
from core.memory.api import router as memory_router
api_router.include_router(referrals_router)
api_router.include_router(memory_router)
from core.endpoints import realtime_api
api_router.include_router(realtime_api.router)
from core.endpoints.website_analysis_api import router as website_analysis_router
api_router.include_router(website_analysis_router)

from core.workflows.workflow_api import router as workflow_router
api_router.include_router(workflow_router)

from core.endpoints.user_keys_api import router as user_keys_router
api_router.include_router(user_keys_router)

from core.workflows.workflow_templates_api import router as workflow_templates_router
api_router.include_router(workflow_templates_router)

from core.agents.agent_pipeline_api import router as pipeline_router
api_router.include_router(pipeline_router)

from core.test_harness.api import router as test_harness_router, e2e_router
api_router.include_router(test_harness_router)
api_router.include_router(e2e_router)


from core.sandbox.canvas_ai_api import router as canvas_ai_router
api_router.include_router(canvas_ai_router)

from core.platform.activity_api import router as platform_activity_router
api_router.include_router(platform_activity_router)

from core.activity.unified_activity_api import router as unified_activity_router
api_router.include_router(unified_activity_router)

from core.integrations.integration_api import router as integrations_router
api_router.include_router(integrations_router)

from core.webhooks.webhook_api import router as webhook_mgmt_router
api_router.include_router(webhook_mgmt_router)

from core.webhooks.webhook_event_log_api import router as webhook_event_log_router
api_router.include_router(webhook_event_log_router)

from core.collaboration.sharing_api import router as collaboration_router
api_router.include_router(collaboration_router)

from core.collaboration.collaboration_rooms_api import router as collaboration_rooms_router
api_router.include_router(collaboration_rooms_router)

from core.search.search_api import router as search_router
api_router.include_router(search_router)

from core.search.global_search_api import router as global_search_router
api_router.include_router(global_search_router)

from core.search.web_search_api import router as web_search_router
api_router.include_router(web_search_router)

from core.marketplace.marketplace_api import router as marketplace_router
api_router.include_router(marketplace_router)

from core.favorites.favorites_api import router as favorites_router
api_router.include_router(favorites_router)

from core.prompts.saved_prompts_api import router as saved_prompts_router
api_router.include_router(saved_prompts_router)

from core.admin.stateless_admin_api import router as stateless_admin_router
api_router.include_router(stateless_admin_router)

from core.admin.health_api import router as health_admin_router
api_router.include_router(health_admin_router)

from core.reports.reports_api import router as reports_router
api_router.include_router(reports_router)

from core.reports.scheduled_reports_api import router as scheduled_reports_router
api_router.include_router(scheduled_reports_router)

from core.teams.team_api import router as team_mgmt_router
api_router.include_router(team_mgmt_router)

from core.audit.audit_api import router as audit_router
api_router.include_router(audit_router)

from core.settings.user_preferences_api import router as user_preferences_router
api_router.include_router(user_preferences_router)

from core.developers.api_playground_api import router as api_playground_router
api_router.include_router(api_playground_router)

from core.developers.api_key_permissions_api import router as api_key_permissions_router
api_router.include_router(api_key_permissions_router)

from core.developers.api_key_scopes_api import router as api_key_scopes_router
api_router.include_router(api_key_scopes_router)

from core.agents.agent_activity_heatmap_api import router as agent_activity_heatmap_router
api_router.include_router(agent_activity_heatmap_router)

from core.dashboard.custom_charts_api import router as custom_charts_router
api_router.include_router(custom_charts_router)

from core.dashboard.widget_config_api import router as widget_config_router
api_router.include_router(widget_config_router)

from core.workspaces.workspace_activity_api import router as workspace_activity_router
api_router.include_router(workspace_activity_router)

from core.monitoring.run_monitor_api import router as run_monitor_router
api_router.include_router(run_monitor_router)

from core.monitoring.incident_api import router as incident_router
api_router.include_router(incident_router)

from core.monitoring.sandbox_monitor_api import router as sandbox_monitor_router
api_router.include_router(sandbox_monitor_router)

from core.monitoring.anomaly_detection_api import router as anomaly_detection_router
api_router.include_router(anomaly_detection_router)

from core.monitoring.system_health_api import router as system_health_router
api_router.include_router(system_health_router)

from core.monitoring.rate_limit_dashboard_api import router as rate_limit_dashboard_router
api_router.include_router(rate_limit_dashboard_router)

from core.threads.thread_folders_api import router as thread_folders_router
api_router.include_router(thread_folders_router)

from core.triggers.trigger_templates_api import router as trigger_templates_router
api_router.include_router(trigger_templates_router)

from core.knowledge_base.kb_relationships_api import router as kb_relationships_router
api_router.include_router(kb_relationships_router)

from core.agents.agent_dependency_api import router as agent_dependency_router
api_router.include_router(agent_dependency_router)

from core.agents.agent_dependency_graph_api import router as agent_dependency_graph_router
api_router.include_router(agent_dependency_graph_router)

from core.threads.conversation_insights_api import router as conversation_insights_router
api_router.include_router(conversation_insights_router)

from core.agents.agent_bundles_api import router as agent_bundles_router
api_router.include_router(agent_bundles_router)

from core.threads.thread_bookmarks_api import router as thread_bookmarks_api_router
api_router.include_router(thread_bookmarks_api_router)

from core.agents.agent_permissions_api import router as agent_permissions_router
api_router.include_router(agent_permissions_router)

from core.threads.conversation_templates_api import router as conversation_templates_router
api_router.include_router(conversation_templates_router)

from core.threads.pinned_messages_api import router as pinned_messages_router
api_router.include_router(pinned_messages_router)

from core.developers.api_usage_heatmap_api import router as api_usage_heatmap_router
api_router.include_router(api_usage_heatmap_router)

from core.agents.agent_favorites_api import router as agent_favorites_router
api_router.include_router(agent_favorites_router)

from core.onboarding.onboarding_checklists_api import router as onboarding_checklists_router
api_router.include_router(onboarding_checklists_router)

from core.preferences.saved_filters_api import router as saved_filters_router
api_router.include_router(saved_filters_router)

from core.agents.agent_run_queue_api import router as agent_run_queue_router
api_router.include_router(agent_run_queue_router)

from core.threads.thread_sentiment_api import router as thread_sentiment_router
api_router.include_router(thread_sentiment_router)

from core.agents.agent_run_logs_api import router as agent_run_logs_router
api_router.include_router(agent_run_logs_router)

from core.threads.thread_export_system_api import router as thread_export_system_router
api_router.include_router(thread_export_system_router)

from core.agents.agent_tags_api import router as agent_tags_router
api_router.include_router(agent_tags_router)

from core.agents.agent_retry_api import router as agent_retry_router
api_router.include_router(agent_retry_router)

from core.agents.model_routing_api import router as model_routing_router
api_router.include_router(model_routing_router)

from core.threads.thread_annotations_api import router as thread_annotations_router
api_router.include_router(thread_annotations_router)

from core.preferences.keyboard_shortcuts_api import router as keyboard_shortcuts_router
api_router.include_router(keyboard_shortcuts_router)

# Agent Webhooks Manager
from core.integrations.agent_webhooks_api import router as agent_webhooks_router
api_router.include_router(agent_webhooks_router)

# Thread Message Reactions
from core.threads.thread_reactions_api import router as thread_reactions_router
api_router.include_router(thread_reactions_router)

# Command Palette
from core.preferences.command_palette_api import router as command_palette_router
api_router.include_router(command_palette_router)

# Bulk Operations
from core.agents.bulk_operations_api import router as bulk_operations_router
api_router.include_router(bulk_operations_router)

# Dashboard Layouts
from core.preferences.dashboard_layouts_api import router as dashboard_layouts_router
api_router.include_router(dashboard_layouts_router)

# Data Retention Policies
from core.preferences.data_retention_api import router as data_retention_router
api_router.include_router(data_retention_router)

# Audit Log
from core.monitoring.audit_log_api import router as audit_log_router
api_router.include_router(audit_log_router)

# Incident Postmortems
from core.monitoring.incident_postmortems_api import router as postmortems_router
api_router.include_router(postmortems_router)

# Agent Cost Alerts
from core.billing.agent_cost_alerts_api import router as agent_cost_alerts_router
api_router.include_router(agent_cost_alerts_router)

# Agent Benchmarks V2
from core.agents.agent_benchmarks_api import router as agent_benchmarks_v2_router
api_router.include_router(agent_benchmarks_v2_router)

# User Preferences Sync
from core.preferences.user_preferences_sync_api import router as user_preferences_sync_router
api_router.include_router(user_preferences_sync_router)

# SLA Monitoring
from core.monitoring.sla_monitoring_api import router as sla_monitoring_router
api_router.include_router(sla_monitoring_router)

# Agent Resource Quotas
from core.agents.agent_resource_quotas_api import router as agent_resource_quotas_router
api_router.include_router(agent_resource_quotas_router)

# Knowledge graph
api_router.include_router(knowledge_graph_router)

# Thread auto-tagging
api_router.include_router(thread_auto_tagging_router)

# Change Impact Analysis
from core.agents.change_impact_api import router as change_impact_router
api_router.include_router(change_impact_router)

# Marketplace Agent Reviews (with pros/cons)
from core.marketplace.marketplace_agent_reviews_api import router as marketplace_agent_reviews_router
api_router.include_router(marketplace_agent_reviews_router)

# Session Replay
from core.debugging.session_replay_api import router as session_replay_router
api_router.include_router(session_replay_router)

# A/B Test Reports (Sprint 64)
from core.agents.ab_test_reports_api import router as ab_test_reports_router
api_router.include_router(ab_test_reports_router)

# Thread Merge (Sprint 64)
from core.threads.thread_merge_api import router as thread_merge_router
api_router.include_router(thread_merge_router)

# Error Patterns (Sprint 64 Phase 3)
api_router.include_router(error_patterns_router)

# Agent Sandbox (Sprint 64 Phase 4)
api_router.include_router(agent_sandbox_router)

# Activity Feed (Sprint 65 Phase 5)
from core.monitoring.activity_feed_api import router as activity_feed_router
api_router.include_router(activity_feed_router)

# Usage Forecasting (Sprint 65 Phase 3)
api_router.include_router(usage_forecasting_router)

# Agent Template Gallery (Sprint 65 Phase 4)
api_router.include_router(agent_template_gallery_router)

# Webhook Payload Templates (Sprint 66 Phase 5)
from core.integrations.webhook_templates_api import router as webhook_templates_router
api_router.include_router(webhook_templates_router)

# Resource Monitoring (Sprint 66 Phase 3)
from core.monitoring.resource_monitoring_api import router as resource_monitoring_router
api_router.include_router(resource_monitoring_router)

# Custom Metrics (Sprint 66 Phase 4)
from core.monitoring.custom_metrics_api import router as custom_metrics_router
api_router.include_router(custom_metrics_router)

# Agent Collaboration Rooms (Sprint 66 Phase 1)
from core.agents.collaboration_rooms_api import router as agent_collaboration_rooms_router
api_router.include_router(agent_collaboration_rooms_router)

# Thread Pinning (Sprint 66 Phase 2)
from core.threads.thread_pinning_api import router as thread_pinning_router
api_router.include_router(thread_pinning_router)

# Multi-Language Prompts (Sprint 67 Phase 5)
from core.prompts.multilang_prompts_api import router as multilang_prompts_router
api_router.include_router(multilang_prompts_router)

# Anomaly Detection Configs (Sprint 67 Phase 3)
from core.monitoring.anomaly_config_api import router as anomaly_config_router
api_router.include_router(anomaly_config_router)

# API Rate Limit Tiers (Sprint 67 Phase 4)
from core.agents.rate_limit_tiers_api import router as rate_limit_tiers_router
from core.agents.rate_limit_tiers_api import agent_router as rate_limit_agent_router
api_router.include_router(rate_limit_tiers_router)
api_router.include_router(rate_limit_agent_router)

# Agent Output Cache (Sprint 67 Phase 1)
from core.agents.agent_output_cache_api import router as agent_output_cache_router
api_router.include_router(agent_output_cache_router)

# Thread Message Bookmarks (Sprint 67 Phase 2)
from core.threads.thread_message_bookmarks_api import router as thread_message_bookmarks_router, bookmarks_router as thread_message_bookmarks_extra_router
api_router.include_router(thread_message_bookmarks_router)
api_router.include_router(thread_message_bookmarks_extra_router)

# Approval Workflows (Sprint 68 Phase 1)
from core.agents.approval_workflows_api import router as approval_workflows_router
api_router.include_router(approval_workflows_router)

# Thread Comparisons (Sprint 68 Phase 2)
from core.threads.thread_comparisons_api import router as thread_comparisons_router
api_router.include_router(thread_comparisons_router)

# Deployment Pipelines (Sprint 68 Phase 5)
from core.agents.deployment_pipelines_api import router as deployment_pipelines_router
api_router.include_router(deployment_pipelines_router)

# Log Aggregation (Sprint 68 Phase 3)
from core.monitoring.log_aggregation_api import router as log_aggregation_router
api_router.include_router(log_aggregation_router)

# Agent Skill Trees (Sprint 68 Phase 4)
from core.agents.agent_skill_trees_api import router as agent_skill_trees_router
api_router.include_router(agent_skill_trees_router)

# Agent Config Snapshots (Sprint 69 Phase 1)
from core.agents.agent_config_snapshots_api import router as agent_config_snapshots_router
api_router.include_router(agent_config_snapshots_router)

# Thread Export Templates (Sprint 69 Phase 2)
from core.threads.thread_export_templates_api import router as thread_export_templates_router
api_router.include_router(thread_export_templates_router)

# Task Queue (Sprint 69 Phase 5)
from core.agents.task_queue_api import router as task_queue_router
api_router.include_router(task_queue_router)

# Cost Tracking (Sprint 69 Phase 3)
from core.billing.cost_tracking_api import router as cost_tracking_router
api_router.include_router(cost_tracking_router)

# Agent Health Checks (Sprint 69 Phase 4)
from core.agents.agent_health_checks_api import router as agent_health_checks_router
api_router.include_router(agent_health_checks_router)

# Agent Personas (Sprint 70 Phase 1)
from core.agents.agent_personas_api import router as agent_personas_router
api_router.include_router(agent_personas_router)

# Thread Summarization (Sprint 70 Phase 2)
from core.threads.thread_summarization_api import router as thread_summarization_router
api_router.include_router(thread_summarization_router)

# Plugin Registry (Sprint 70 Phase 5)
from core.agents.plugin_registry_api import router as plugin_registry_router
api_router.include_router(plugin_registry_router)

# Quota Alerts (Sprint 70 Phase 3)
from core.monitoring.quota_alerts_api import router as quota_alerts_router
api_router.include_router(quota_alerts_router)

# Agent Benchmark Suites (Sprint 70 Phase 4)
from core.agents.agent_benchmark_suites_api import router as agent_benchmark_suites_router
api_router.include_router(agent_benchmark_suites_router)

# Notification Templates (Sprint 71 Phase 5)
from core.monitoring.notification_templates_api import router as notification_templates_router
api_router.include_router(notification_templates_router)

# Execution Traces (Sprint 71 Phase 3)
from core.agents.execution_traces_api import router as execution_traces_router
api_router.include_router(execution_traces_router)

# A/B Testing (Sprint 71 Phase 4)
from core.agents.ab_testing_api import router as ab_testing_router
api_router.include_router(ab_testing_router)

# Agent Secrets Vault (Sprint 71 Phase 1)
from core.agents.agent_secrets_api import router as agent_secrets_router
api_router.include_router(agent_secrets_router)

# Thread Labels — already registered above (line ~531)

# Agent Feedback (Sprint 72 Phase 1)
from core.agents.agent_feedback_api import router as agent_feedback_router
api_router.include_router(agent_feedback_router)

# Thread Search Index (Sprint 72 Phase 2)
from core.threads.thread_search_index_api import router as thread_search_index_router
api_router.include_router(thread_search_index_router)

# Alert Escalation (Sprint 72 Phase 3)
from core.monitoring.alert_escalation_api import router as alert_escalation_router
api_router.include_router(alert_escalation_router)

# Agent Audit Log (Sprint 72 Phase 4)
from core.agents.agent_audit_log_api import router as agent_audit_log_router
api_router.include_router(agent_audit_log_router)

# Data Pipelines (Sprint 72 Phase 5)
from core.agents.data_pipeline_api import router as data_pipeline_router
api_router.include_router(data_pipeline_router)

# Agent Memory Profiles (Sprint 73 Phase 1)
from core.agents.agent_memory_profiles_api import router as agent_memory_profiles_router
api_router.include_router(agent_memory_profiles_router)

# Thread Replay (Sprint 73 Phase 2)
from core.threads.thread_replay_api import router as thread_replay_router
api_router.include_router(thread_replay_router)

# Capacity Planning (Sprint 73 Phase 3)
from core.monitoring.capacity_planning_api import router as capacity_planning_router
api_router.include_router(capacity_planning_router)

# Marketplace Reviews (Sprint 73 Phase 4)
from core.agents.marketplace_reviews_api import router as marketplace_reviews_router
api_router.include_router(marketplace_reviews_router)

# Integration Health (Sprint 73 Phase 5)
from core.monitoring.integration_health_api import router as integration_health_router
api_router.include_router(integration_health_router)

# Response Templates (Sprint 74 Phase 1)
from core.agents.response_templates_api import router as response_templates_router
api_router.include_router(response_templates_router)

# Thread Analytics V2 (Sprint 74 Phase 2)
from core.threads.thread_analytics_v2_api import router as thread_analytics_v2_router
api_router.include_router(thread_analytics_v2_router)

# Error Recovery Playbooks (Sprint 74 Phase 3)
from core.agents.error_recovery_api import router as error_recovery_router
api_router.include_router(error_recovery_router)

# Agent Comparison V2 (Sprint 74 Phase 4)
from core.agents.agent_comparison_v2_api import router as agent_comparison_v2_router
api_router.include_router(agent_comparison_v2_router)

# Workspace Management (Sprint 74 Phase 5)
from core.agents.workspace_management_api import router as workspace_management_router
api_router.include_router(workspace_management_router)

# Client Error Monitoring (self-hosted Sentry alternative)
from core.monitoring.client_errors_api import router as client_errors_router
api_router.include_router(client_errors_router)
from core.monitoring.error_reporter_script import router as error_reporter_script_router
api_router.include_router(error_reporter_script_router)

# Auth OTP endpoint for expired magic links
api_router.include_router(auth_api.router)
api_router.include_router(mfa_api.router)

@api_router.post("/threads/{thread_id}/compress", summary="Compress Thread Context", operation_id="compress_thread_context", tags=["threads"])
async def compress_thread_context(thread_id: str, request: Request):
    from core.ai.context_compressor import compress_messages
    data = await request.json()
    messages = data.get("messages", [])
    preserve_last_n = data.get("preserve_last_n", 4)
    compressed = compress_messages(messages, preserve_last_n=preserve_last_n)
    return {
        "compressed_messages": compressed,
        "original_count": len(messages),
        "compressed_count": len(compressed),
    }

@api_router.get("/agents/{agent_id}/cost-estimate", summary="Cost Estimate", operation_id="get_cost_estimate", tags=["agents"])
async def get_cost_estimate(agent_id: str, prompt_length: int = 500, model: str = "claude-sonnet-4"):
    from core.ai.cost_estimator import estimate_cost
    return estimate_cost(model=model, input_tokens=prompt_length)

@api_router.get("/health", summary="Health Check", operation_id="health_check", tags=["system"])
async def health_check():
    logger.debug("Health check endpoint called")

    # During shutdown, return unhealthy status
    # This causes K8s readinessProbe to fail and removes pod from service endpoints
    if _is_shutting_down:
        logger.debug(f"Health check returning unhealthy (shutting down) for instance {instance_id}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "shutting_down",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "instance_id": instance_id
            }
        )
    
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": instance_id,
    }

@api_router.post("/prewarm", summary="Prewarm User Caches", operation_id="prewarm_user", tags=["system"])
async def prewarm_user_caches(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    async def _do_prewarm():
        try:
            from core.cache.runtime_cache import prewarm_user_agents
            await prewarm_user_agents(user_id)
        except Exception as e:
            logger.warning(f"[PREWARM] Background prewarm failed for {user_id[:8]}...: {e}")
    
    asyncio.create_task(_do_prewarm())
    
    return {"status": "accepted", "message": "Prewarming started in background"}

@api_router.get("/metrics", summary="System Metrics", operation_id="metrics", tags=["system"])
async def metrics_endpoint():
    """
    Get API instance metrics for monitoring.
    
    Returns:
        - active_agent_runs: Total active runs across all instances (from DB)
        - active_redis_streams: Active Redis stream keys
        - orphaned_streams: Streams without DB records (should be 0)
    """
    from core.services import worker_metrics
    
    try:
        return await worker_metrics.get_worker_metrics()
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")

@api_router.get("/debug", summary="Debug Information", operation_id="debug", tags=["system"])
async def debug_endpoint():
    """Get basic debug information for troubleshooting."""
    from core.agents.api import _cancellation_events
    
    return {
        "instance_id": instance_id,
        "active_runs_on_instance": len(_cancellation_events),
        "is_shutting_down": _is_shutting_down,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/debug/redis", summary="Redis Health & Diagnostics", operation_id="redis_health", tags=["system"])
async def redis_health_endpoint():
    """
    Get detailed Redis health and pool diagnostics.
    
    Returns:
        - status: healthy, degraded, or unhealthy
        - latency_ms: ping latency in milliseconds
        - pool: connection pool statistics
        - timeouts: configured timeout values
    """
    try:
        health_data = await redis.health_check()
        
        # Add instance info
        health_data["instance_id"] = instance_id    
        health_data["timestamp"] = datetime.now(timezone.utc).isoformat()
        
        # Return appropriate status code
        if health_data.get("status") == "unhealthy":
            return JSONResponse(status_code=503, content=health_data)
        elif health_data.get("status") == "degraded":
            return JSONResponse(status_code=200, content=health_data)
        else:
            return health_data
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": str(e),
                "instance_id": instance_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )

def _get_health_metrics() -> dict:
    from core.services.system_metrics import get_system_metrics
    metrics = get_system_metrics()
    metrics["instance_id"] = instance_id
    metrics["timestamp"] = datetime.now(timezone.utc).isoformat()
    try:
        from core.agents.api import _cancellation_events
        metrics["active_runs_on_instance"] = len(_cancellation_events)
    except Exception:
        metrics["active_runs_on_instance"] = None
    try:
        from core.utils.lifecycle_tracker import get_active_runs
        metrics["lifecycle_active_runs"] = len(get_active_runs())
    except Exception:
        metrics["lifecycle_active_runs"] = None
    return metrics


@api_router.get("/health-docker", summary="Docker Health Check", operation_id="health_check_docker", tags=["system"])
async def health_check_docker():
    logger.debug("Health docker check endpoint called")
    try:
        client = await redis.get_client()
        await client.ping()
        from core.services.db import execute_one as _health_execute_one
        await _health_execute_one("SELECT thread_id FROM threads LIMIT 1")
        logger.debug("Health docker check complete")
        metrics = _get_health_metrics()
        return {
            "status": "ok",
            "timestamp": metrics["timestamp"],
            "instance_id": instance_id,
            "metrics": {k: v for k, v in metrics.items() if k not in ("timestamp", "instance_id")},
        }
    except Exception as e:
        logger.error(f"Failed health docker check: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")


# Unified Model Registry
api_router.include_router(models_router)

app.include_router(api_router, prefix="/v1")

METRICS_LOG_INTERVAL_SECONDS = int(os.getenv("METRICS_LOG_INTERVAL_SECONDS", "300"))  # 5 min


async def _metrics_logger_loop():
    import json
    await asyncio.sleep(60) 
    logger.info("[METRICS_LOG] Started, interval=%ds", METRICS_LOG_INTERVAL_SECONDS)
    try:
        while True:
            try:
                metrics = _get_health_metrics()
                log_payload = {"event": "system_metrics", **metrics}
                logger.info("system_metrics %s", json.dumps(log_payload))
            except Exception as e:
                logger.debug("metrics_logger error: %s", e)
            await asyncio.sleep(METRICS_LOG_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.debug("Metrics logger cancelled")


async def _memory_watchdog():
    import time as time_module
    
    workers = int(os.getenv("WORKERS", "16"))
    total_ram_mb = psutil.virtual_memory().total / 1024 / 1024
    per_worker_limit_mb = (total_ram_mb * 0.8) / workers
    
    critical_threshold_mb = per_worker_limit_mb * 0.87
    warning_threshold_mb = per_worker_limit_mb * 0.80
    info_threshold_mb = per_worker_limit_mb * 0.67
    
    logger.info(
        f"Memory watchdog started: {total_ram_mb/1024:.1f}GB total, "
        f"{per_worker_limit_mb/1024:.1f}GB per worker ({workers} workers)"
    )
    
    try:
        while True:
            try:
                process = psutil.Process()
                mem_info = process.memory_info()
                mem_mb = mem_info.rss / 1024 / 1024
                mem_percent = (mem_mb / per_worker_limit_mb) * 100
                
                # === NEW: Cleanup state tracking ===
                from core.agents.api import _cancellation_events
                try:
                    from core.utils.lifecycle_tracker import get_active_runs
                    active_runs = get_active_runs()
                    stale_runs = [
                        rid for rid, start in active_runs.items() 
                        if (time_module.time() - start) > 3600  # > 1 hour
                    ]
                except ImportError:
                    active_runs = {}
                    stale_runs = []
                
                cancellation_count = len(_cancellation_events)
                active_count = len(active_runs)
                stale_count = len(stale_runs)
                
                if stale_count > 0 or cancellation_count > 10:
                    logger.warning(
                        f"[WATCHDOG] mem={mem_mb:.0f}MB "
                        f"cancellation_events={cancellation_count} "
                        f"active_runs={active_count} "
                        f"stale_runs={stale_count} "
                        f"instance={instance_id}"
                    )
                    if stale_runs:
                        logger.warning(f"[WATCHDOG] stale_run_ids={stale_runs[:5]}")
                # === END NEW ===
                
                # Existing memory threshold logging
                if mem_mb > critical_threshold_mb:
                    logger.error(
                        f"🚨 CRITICAL: Worker memory {mem_mb:.0f}MB ({mem_percent:.1f}%) "
                        f"cancellation_events={cancellation_count} "
                        f"active_runs={active_count} "
                        f"instance={instance_id}"
                    )
                    import gc
                    gc.collect()
                elif mem_mb > warning_threshold_mb:
                    logger.warning(
                        f"⚠️ Worker memory high: {mem_mb:.0f}MB ({mem_percent:.1f}%) "
                        f"cancellation_events={cancellation_count} "
                        f"instance={instance_id}"
                    )
                elif mem_mb > info_threshold_mb:
                    logger.info(
                        f"Worker memory: {mem_mb:.0f}MB ({mem_percent:.1f}%) "
                        f"cancellation_events={cancellation_count} "
                        f"instance={instance_id}"
                    )
                
            except Exception as e:
                logger.debug(f"Memory watchdog error: {e}")
            
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        logger.debug("Memory watchdog cancelled")
    except Exception as e:
        logger.error(f"Memory watchdog failed: {e}")


if __name__ == "__main__":
    import uvicorn
    
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # Enable reload mode for local and staging environments
    is_dev_env = config.ENV_MODE in [EnvMode.LOCAL, EnvMode.STAGING]
    workers = 1 if is_dev_env else 4
    reload = is_dev_env
    
    logger.debug(f"Starting server on 0.0.0.0:8000 with {workers} workers (reload={reload})")
    uvicorn.run(
        "api:app", 
        host="0.0.0.0", 
        port=8000,
        workers=workers,
        loop="asyncio",
        reload=reload
    )
