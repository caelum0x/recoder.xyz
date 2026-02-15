from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel
from core.auth import require_admin
from core.utils.logger import logger
from core.utils.pagination import PaginationService, PaginationParams, PaginatedResponse
from core.utils.auth_utils import verify_admin_api_key
from core.utils.recoder_default_agent_service import RecoderDefaultAgentService
from core.utils.config import config, EnvMode
from core.services.db import execute_read, execute_one, execute_one_read, serialize_rows
from dotenv import load_dotenv, set_key, find_dotenv, dotenv_values
import os

router = APIRouter(prefix="/admin", tags=["admin"])

# ============================================================================
# MODELS
# ============================================================================

class UserSummary(BaseModel):
    id: str
    email: str
    created_at: datetime
    tier: str
    credit_balance: float
    total_purchased: float
    total_used: float
    subscription_status: Optional[str] = None
    last_activity: Optional[datetime] = None
    trial_status: Optional[str] = None

class UserThreadSummary(BaseModel):
    thread_id: str
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    is_public: bool
    created_at: datetime
    updated_at: datetime

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/users/list")
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search_email: Optional[str] = Query(None, description="Search by email"),
    search_name: Optional[str] = Query(None, description="Search by name"),
    tier_filter: Optional[str] = Query(None, description="Filter by tier"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    admin: dict = Depends(require_admin)
) -> PaginatedResponse[UserSummary]:
    """List all users with pagination and filtering."""
    try:
        pagination_params = PaginationParams(page=page, page_size=page_size)

        # Use database function to handle the join, filter, sort, and pagination
        result_data = await execute_one(
            "SELECT * FROM admin_list_users_by_tier(:p_tier, :p_search_email, :p_page, :p_page_size, :p_sort_by, :p_sort_order)",
            {
                "p_tier": tier_filter,
                "p_search_email": search_email,
                "p_page": page,
                "p_page_size": page_size,
                "p_sort_by": sort_by,
                "p_sort_order": sort_order.lower(),
            }
        )

        if not result_data:
            return await PaginationService.paginate_with_total_count(
                items=[],
                total_count=0,
                params=pagination_params
            )

        total_count = result_data.get('total_count', 0)
        raw_users = result_data.get('data', []) or []

        users = []
        for item in raw_users:
            users.append(UserSummary(
                id=item['id'],
                email=item.get('email') or 'N/A',
                created_at=datetime.fromisoformat(item['created_at'].replace('Z', '+00:00')),
                tier=item.get('tier', 'free'),
                credit_balance=float(item.get('credit_balance', 0)),
                total_purchased=float(item.get('total_purchased', 0)),
                total_used=float(item.get('total_used', 0)),
                subscription_status=item.get('subscription_status'),
                trial_status=item.get('trial_status')
            ))

        return await PaginationService.paginate_with_total_count(
            items=users,
            total_count=total_count,
            params=pagination_params
        )

    except Exception as e:
        logger.error(f"Failed to list users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve users")

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    admin: dict = Depends(require_admin)
):
    """Get detailed information about a specific user."""
    try:
        # Fetch account with billing customer email and subscription info
        account_rows = await execute_read(
            """
            SELECT a.id, a.created_at, a.primary_owner_user_id,
                   bc.email AS billing_email,
                   bs.status AS subscription_status,
                   bs.created AS subscription_created,
                   bs.current_period_end AS subscription_period_end
            FROM basejump.accounts a
            LEFT JOIN basejump.billing_customers bc ON bc.account_id = a.id
            LEFT JOIN basejump.billing_subscriptions bs ON bs.account_id = a.id
            WHERE a.id = :user_id
            """,
            {"user_id": user_id}
        )

        if not account_rows:
            raise HTTPException(status_code=404, detail="User not found")

        row = account_rows[0]
        account = {
            "id": row["id"],
            "created_at": row["created_at"],
            "primary_owner_user_id": row["primary_owner_user_id"],
            "billing_customers": [{"email": row.get("billing_email")}] if row.get("billing_email") else [],
            "billing_subscriptions": [
                {
                    "status": row["subscription_status"],
                    "created": row["subscription_created"],
                    "current_period_end": row["subscription_period_end"],
                }
            ] if row.get("subscription_status") else [],
        }

        # If no billing email found, try the get_user_email function
        if not account.get('billing_customers') or not account['billing_customers'][0].get('email'):
            if account.get('primary_owner_user_id'):
                try:
                    email_row = await execute_one(
                        "SELECT get_user_email(:user_id) AS email",
                        {"user_id": account["primary_owner_user_id"]}
                    )
                    if email_row and email_row.get("email"):
                        if not account.get('billing_customers'):
                            account['billing_customers'] = [{}]
                        account['billing_customers'][0]['email'] = email_row["email"]
                except Exception as e:
                    logger.warning(f"Failed to get email for account {user_id}: {e}")

        # Fetch credit account info
        credit_rows = await execute_read(
            """
            SELECT balance, tier, lifetime_granted, lifetime_purchased,
                   lifetime_used, last_grant_date
            FROM credit_accounts
            WHERE account_id = :account_id
            """,
            {"account_id": user_id}
        )

        if credit_rows:
            account['credit_accounts'] = serialize_rows(credit_rows)
        else:
            account['credit_accounts'] = [{
                'balance': '0',
                'tier': 'free',
                'lifetime_granted': '0',
                'lifetime_purchased': '0',
                'lifetime_used': '0',
                'last_grant_date': None
            }]

        # Fetch recent activity (agent runs for this account via threads join)
        activity_rows = await execute_read(
            """
            SELECT ar.id, ar.created_at, ar.status, ar.thread_id
            FROM agent_runs ar
            INNER JOIN threads t ON t.thread_id = ar.thread_id
            WHERE t.account_id = :account_id
            ORDER BY ar.created_at DESC
            LIMIT 10
            """,
            {"account_id": user_id}
        )

        return {
            "user": account,
            "recent_activity": serialize_rows(activity_rows)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve user details")

@router.get("/users/stats/overview")
async def get_user_stats_overview(
    admin: dict = Depends(require_admin)
):
    """Get overview statistics about all users."""
    try:
        # Total accounts
        total_row = await execute_one_read(
            "SELECT COUNT(*) AS cnt FROM basejump.accounts"
        )
        total_users = total_row["cnt"] if total_row else 0

        # Tier distribution
        tier_rows = await execute_read("SELECT tier FROM credit_accounts")
        tier_counts: Dict[str, int] = {}
        for item in tier_rows:
            tier = item.get('tier', 'free')
            tier_counts[tier] = tier_counts.get(tier, 0) + 1

        tier_distribution = [
            {"tier": tier, "count": count}
            for tier, count in tier_counts.items()
        ]

        # Active users in last 30 days
        thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()

        active_row = await execute_one_read(
            """
            SELECT COUNT(DISTINCT t.account_id) AS cnt
            FROM agent_runs ar
            INNER JOIN threads t ON t.thread_id = ar.thread_id
            WHERE ar.created_at >= :since
            """,
            {"since": thirty_days_ago}
        )
        active_count = active_row["cnt"] if active_row else 0

        # Credit totals
        credit_rows = await execute_read("SELECT balance FROM credit_accounts")
        total_credits = sum(float(item.get('balance', 0)) for item in credit_rows)
        avg_credits = total_credits / max(1, len(credit_rows))

        return {
            "total_users": total_users,
            "active_users_30d": active_count,
            "tier_distribution": tier_distribution,
            "total_credits_in_system": round(total_credits, 2),
            "average_credit_balance": round(avg_credits, 2)
        }

    except Exception as e:
        logger.error(f"Failed to get user stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve user statistics")

@router.get("/users/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    admin: dict = Depends(require_admin)
):
    """Get paginated activity (agent runs) for a specific user."""
    try:
        pagination_params = PaginationParams(page=page, page_size=page_size)

        # Build WHERE clause
        status_clause = "AND ar.status = :status_filter" if status_filter else ""
        params: Dict[str, Any] = {"account_id": user_id}
        if status_filter:
            params["status_filter"] = status_filter

        # Get total count
        count_row = await execute_one_read(
            f"""
            SELECT COUNT(*) AS cnt
            FROM agent_runs ar
            INNER JOIN threads t ON t.thread_id = ar.thread_id
            WHERE t.account_id = :account_id {status_clause}
            """,
            params
        )
        total_count = count_row["cnt"] if count_row else 0

        # Get paginated activity
        offset = (pagination_params.page - 1) * pagination_params.page_size
        page_params = {**params, "lim": pagination_params.page_size, "off": offset}

        activity_rows = await execute_read(
            f"""
            SELECT ar.*, t.account_id, t.thread_id AS t_thread_id
            FROM agent_runs ar
            INNER JOIN threads t ON t.thread_id = ar.thread_id
            WHERE t.account_id = :account_id {status_clause}
            ORDER BY ar.created_at DESC
            LIMIT :lim OFFSET :off
            """,
            page_params
        )

        # Format activity data
        activities = []
        for run in activity_rows:
            thread_id = run.get('thread_id', '')
            activities.append({
                'id': run.get('id'),
                'created_at': run.get('created_at'),
                'updated_at': run.get('updated_at'),
                'status': run.get('status'),
                'thread_id': thread_id,
                'thread_name': f"Thread {thread_id.split('-')[0] if thread_id else 'Unknown'}",
                'agent_id': run.get('agent_id'),
                'agent_name': 'Agent',
                'credit_cost': float(run.get('credit_cost', 0) if run.get('credit_cost') else 0),
                'error': run.get('error'),
                'duration_ms': run.get('duration_ms')
            })

        return await PaginationService.paginate_with_total_count(
            items=activities,
            total_count=total_count,
            params=pagination_params
        )

    except Exception as e:
        logger.error(f"Failed to get user activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user activity")

@router.get("/users/threads/by-email")
async def get_user_threads_by_email(
    email: str = Query(..., description="User email to fetch threads for"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: dict = Depends(require_admin)
) -> PaginatedResponse[UserThreadSummary]:
    """Get all project threads for a user by their email with clickable URLs."""
    try:
        pagination_params = PaginationParams(page=page, page_size=page_size)

        # Find account_id by email from billing_customers
        email_row = await execute_one_read(
            "SELECT account_id FROM basejump.billing_customers WHERE email = :email LIMIT 1",
            {"email": email}
        )

        if not email_row:
            try:
                oauth_row = await execute_one(
                    "SELECT get_account_by_email(:search_email) AS account_id",
                    {"search_email": email}
                )
                if not oauth_row or not oauth_row.get("account_id"):
                    return await PaginationService.paginate_with_total_count(
                        items=[],
                        total_count=0,
                        params=pagination_params
                    )
                account_id = oauth_row["account_id"]
            except Exception as e:
                logger.warning(f"Could not find account for email {email}: {e}")
                return await PaginationService.paginate_with_total_count(
                    items=[],
                    total_count=0,
                    params=pagination_params
                )
        else:
            account_id = email_row['account_id']

        # Get total count
        count_row = await execute_one_read(
            "SELECT COUNT(*) AS cnt FROM threads WHERE account_id = :account_id",
            {"account_id": account_id}
        )
        total_count = count_row["cnt"] if count_row else 0

        # Get paginated threads
        offset = (pagination_params.page - 1) * pagination_params.page_size
        thread_rows = await execute_read(
            """
            SELECT thread_id, project_id, is_public, created_at, updated_at
            FROM threads
            WHERE account_id = :account_id
            ORDER BY updated_at DESC
            LIMIT :lim OFFSET :off
            """,
            {"account_id": account_id, "lim": pagination_params.page_size, "off": offset}
        )

        if not thread_rows:
            return await PaginationService.paginate_with_total_count(
                items=[],
                total_count=total_count,
                params=pagination_params
            )

        # Get project information
        project_ids = [t['project_id'] for t in thread_rows if t.get('project_id')]

        projects_map: Dict[str, str] = {}
        if project_ids:
            # Build parameterised IN list
            id_params = {f"pid_{i}": pid for i, pid in enumerate(project_ids)}
            placeholders = ", ".join(f":pid_{i}" for i in range(len(project_ids)))
            project_rows = await execute_read(
                f"SELECT project_id, name FROM projects WHERE project_id IN ({placeholders})",
                id_params
            )
            projects_map = {p['project_id']: p['name'] for p in project_rows}

        # Build thread summaries
        threads = []
        for thread in thread_rows:
            project_id = thread.get('project_id')
            project_name = projects_map.get(project_id) if project_id else None

            threads.append(UserThreadSummary(
                thread_id=thread['thread_id'],
                project_id=project_id,
                project_name=project_name,
                is_public=thread.get('is_public', False),
                created_at=datetime.fromisoformat(str(thread['created_at']).replace('Z', '+00:00')),
                updated_at=datetime.fromisoformat(str(thread['updated_at']).replace('Z', '+00:00'))
            ))

        return await PaginationService.paginate_with_total_count(
            items=threads,
            total_count=total_count,
            params=pagination_params
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user threads by email: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve user threads")

# ============================================================================
# AGENT & SYSTEM MANAGEMENT
# ============================================================================

@router.post("/recoder-agents/install-user/{account_id}")
async def admin_install_recoder_for_user(
    account_id: str,
    replace_existing: bool = False,
    _: bool = Depends(verify_admin_api_key)
):
    """Install Recoder agent for a specific user."""
    logger.debug(f"Admin installing Recoder agent for user: {account_id}")
    
    service = RecoderDefaultAgentService()
    agent_id = await service.install_recoder_agent_for_user(account_id, replace_existing)
    
    if agent_id:
        return {
            "success": True,
            "message": f"Successfully installed Recoder agent for user {account_id}",
            "agent_id": agent_id
        }
    else:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to install Recoder agent for user {account_id}"
        )

@router.get("/env-vars")
def get_env_vars() -> Dict[str, str]:
    """Get environment variables (local mode only)."""
    if config.ENV_MODE != EnvMode.LOCAL:
        raise HTTPException(status_code=403, detail="Env vars management only available in local mode")
    
    try:
        env_path = find_dotenv()
        if not env_path:
            logger.error("Could not find .env file")
            return {}
        
        return dotenv_values(env_path)
    except Exception as e:
        logger.error(f"Failed to get env vars: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get env variables: {e}")

@router.post("/env-vars")
def save_env_vars(request: Dict[str, str]) -> Dict[str, str]:
    """Save environment variables (local mode only)."""
    if config.ENV_MODE != EnvMode.LOCAL:
        raise HTTPException(status_code=403, detail="Env vars management only available in local mode")

    try:
        env_path = find_dotenv()
        if not env_path:
            raise HTTPException(status_code=500, detail="Could not find .env file")
        
        for key, value in request.items():
            set_key(env_path, key, value)
        
        load_dotenv(override=True)
        logger.debug(f"Env variables saved successfully: {request}")
        return {"message": "Env variables saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save env variables: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save env variables: {e}")
