import hmac
from fastapi import HTTPException, Request, Header
from typing import Optional, Dict
from core.utils.config import config
from core.services import redis
from core.utils.logger import logger, structlog
import time
from datetime import datetime, timezone


def _constant_time_compare(a: str, b: str) -> bool:
    """Constant-time string comparison to prevent timing attacks."""
    return hmac.compare_digest(a.encode('utf-8'), b.encode('utf-8'))


# ============================================================================
# Better-Auth Session Token Verification
# ============================================================================

# Connection pool for auth database (lazy-initialized)
_auth_engine = None


async def _get_auth_engine():
    """
    Get or create an async SQLAlchemy engine for the auth database.
    Uses AUTH_DATABASE_URL to connect directly to better-auth session tables.
    """
    global _auth_engine
    if _auth_engine is not None:
        return _auth_engine

    auth_db_url = config.AUTH_DATABASE_URL
    if not auth_db_url:
        return None

    from sqlalchemy.ext.asyncio import create_async_engine

    # Convert postgres:// to postgresql+asyncpg://
    if auth_db_url.startswith("postgres://"):
        auth_db_url = auth_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif auth_db_url.startswith("postgresql://"):
        auth_db_url = auth_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    _auth_engine = create_async_engine(
        auth_db_url,
        pool_size=3,
        max_overflow=5,
        pool_timeout=10,
        pool_recycle=300,
    )
    return _auth_engine


async def get_auth_user_by_id(user_id: str) -> Optional[Dict]:
    """
    Get user info (id, email, name) from the users table.

    Returns dict with 'id', 'email', 'name' keys, or None if not found.
    """
    engine = await _get_auth_engine()
    if engine is None:
        return None

    try:
        async with engine.connect() as conn:
            # Try "users" table first (primary, where the adapter writes)
            result = await conn.exec_driver_sql(
                'SELECT "id", "email", "name" '
                'FROM "users" '
                'WHERE "id" = $1 '
                'LIMIT 1',
                (user_id,),
            )
            row = result.fetchone()

        if not row:
            return None

        return {"id": row[0], "email": row[1], "name": row[2]}
    except Exception as e:
        logger.warning(f"Failed to get auth user {user_id}: {e}")
        return None


async def _verify_session_token(token: str) -> Optional[str]:
    """
    Verify a better-auth session token by looking it up in the auth database.

    Returns the user_id if the session is valid, or None if invalid/expired.

    The session token format from better-auth cookies may have a signature
    suffix after ".", so we split on "." and use the first part.
    """
    engine = await _get_auth_engine()
    if engine is None:
        return None

    # Extract the token value (before any signature suffix)
    session_token = token.split(".")[0] if "." in token else token

    try:
        # Use exec_driver_sql with positional params ($1) to preserve
        # double-quoted camelCase column names (asyncpg text() strips them).
        # Check "sessions" (primary, where adapter writes) then "session" (legacy).
        async with engine.connect() as conn:
            result = await conn.exec_driver_sql(
                'SELECT "userId", "expiresAt" '
                'FROM "sessions" '
                'WHERE "token" = $1 '
                'LIMIT 1',
                (session_token,),
            )
            row = result.fetchone()

            # Fallback: legacy "session" table
            if not row:
                result = await conn.exec_driver_sql(
                    'SELECT "userId", "expiresAt" '
                    'FROM "session" '
                    'WHERE "token" = $1 '
                    'LIMIT 1',
                    (session_token,),
                )
                row = result.fetchone()

        if not row:
            return None

        user_id, expires_at = row

        # Check expiration
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None

        return user_id
    except Exception as e:
        logger.error(f"Session token verification failed: {e}")
        return None


# Session token cache (in-memory, short TTL)
_session_cache: Dict[str, tuple] = {}  # token -> (user_id, cache_expiry)
_SESSION_CACHE_TTL = 60  # 60 seconds


async def verify_session_token_cached(token: str) -> Optional[str]:
    """
    Verify a better-auth session token with in-memory caching.
    Also auto-provisions a basejump account on first auth.
    Returns user_id if valid, None otherwise.
    """
    now = time.time()

    # Check cache first
    cached = _session_cache.get(token)
    if cached and cached[1] > now:
        return cached[0]

    user_id = await _verify_session_token(token)
    if user_id:
        _session_cache[token] = (user_id, now + _SESSION_CACHE_TTL)
        # Auto-create basejump account if needed (non-blocking, cached)
        await _ensure_basejump_account(user_id)

    return user_id


# ============================================================================
# Auto-provisioning: ensure every authenticated user has a basejump account
# ============================================================================

_provisioned_users: set = set()  # In-memory set of already-provisioned user IDs


async def _ensure_basejump_account(user_id: str):
    """Auto-create a basejump personal account for a user if one doesn't exist.

    Uses the BACKEND database (recoder_backend), not the auth database,
    because basejump tables live alongside projects/threads/agents.

    Fast: in-memory cache skips DB for known users.
    """
    if user_id in _provisioned_users:
        return

    try:
        from core.services.db import execute_one, execute_mutate

        # Check if account already exists (fast path)
        existing = await execute_one(
            "SELECT id FROM basejump.accounts WHERE id = :uid",
            {"uid": user_id}
        )
        if existing:
            _provisioned_users.add(user_id)
            return

        # Create personal account (user_id = account_id)
        await execute_mutate(
            """INSERT INTO basejump.accounts (id, primary_owner_user_id, name, personal_account)
               VALUES (:uid, :uid, '', true)
               ON CONFLICT (id) DO NOTHING""",
            {"uid": user_id}
        )

        # Create membership
        await execute_mutate(
            """INSERT INTO basejump.account_user (user_id, account_id, account_role)
               VALUES (:uid, :uid, 'owner')
               ON CONFLICT (user_id, account_id) DO NOTHING""",
            {"uid": user_id}
        )

        _provisioned_users.add(user_id)
        logger.info(f"Auto-provisioned basejump account for user {user_id}")
    except Exception as e:
        # Non-fatal — user can still authenticate, just may hit 403 on first request
        logger.warning(f"Auto-provision basejump account failed for {user_id}: {e}")


async def verify_admin_api_key(x_admin_api_key: Optional[str] = Header(None)):
    if not config.RECODER_ADMIN_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Admin API key not configured on server"
        )
    
    if not x_admin_api_key:
        raise HTTPException(
            status_code=401,
            detail="Admin API key required. Include X-Admin-Api-Key header."
        )
    
    # Use constant-time comparison to prevent timing attacks
    if not _constant_time_compare(x_admin_api_key, config.RECODER_ADMIN_API_KEY):
        raise HTTPException(
            status_code=403,
            detail="Invalid admin API key"
        )
    
    return True


async def get_account_id_from_thread(thread_id: str, db=None) -> str:
    """
    Get account_id from thread_id.
    
    Raises:
        ValueError: If thread not found or has no account_id
    """
    try:
        from core.services.db import execute_one

        thread_result = await execute_one(
            """
            SELECT account_id
            FROM threads
            WHERE thread_id::text = :thread_id
            LIMIT 1
            """,
            {"thread_id": thread_id},
        )

        if not thread_result:
            raise ValueError(f"Could not find thread with ID: {thread_id}")

        account_id = thread_result.get("account_id")
        if not account_id:
            raise ValueError("Thread has no associated account_id")

        return account_id
    except Exception as e:
        structlog.get_logger().error(f"Error getting account_id from thread: {e}")
        raise


async def _get_user_id_from_account_cached(account_id: str) -> Optional[str]:
    cache_key = f"account_user:{account_id}"
    
    try:
        cached_user_id = await redis.get(cache_key)
        if cached_user_id:
            return cached_user_id.decode('utf-8') if isinstance(cached_user_id, bytes) else cached_user_id
    except Exception as e:
        structlog.get_logger().warning(f"Redis cache lookup failed for account {account_id}: {e}")
    
    try:
        from core.services.db import execute_one

        user_result = await execute_one(
            """
            SELECT primary_owner_user_id
            FROM basejump.accounts
            WHERE id = :account_id
            LIMIT 1
            """,
            {"account_id": account_id},
        )

        if user_result:
            user_id = user_result.get("primary_owner_user_id")
            if not user_id:
                return None

            try:
                await redis.setex(cache_key, 300, user_id)
            except Exception as e:
                structlog.get_logger().warning(f"Failed to cache user lookup: {e}")

            return user_id

        return None

    except Exception as e:
        structlog.get_logger().error(f"Database lookup failed for account {account_id}: {e}")
        return None

async def verify_and_get_user_id_from_jwt(request: Request) -> str:
    x_api_key = request.headers.get('x-api-key')

    if x_api_key:
        try:
            if ':' not in x_api_key:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid API key format. Expected format: pk_xxx:sk_xxx",
                    headers={"WWW-Authenticate": "Bearer"}
                )

            public_key, secret_key = x_api_key.split(':', 1)

            from core.services.api_keys import APIKeyService
            api_key_service = APIKeyService()

            validation_result = await api_key_service.validate_api_key(public_key, secret_key)

            if validation_result.is_valid:
                user_id = await _get_user_id_from_account_cached(str(validation_result.account_id))

                if user_id:
                    structlog.contextvars.bind_contextvars(
                        user_id=user_id,
                        auth_method="api_key",
                        api_key_id=str(validation_result.key_id),
                        public_key=public_key
                    )
                    return user_id
                else:
                    # Log detailed error for debugging but return generic message
                    logger.warning(f"API key valid but account not found: {public_key[:8]}...")
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid API key",
                        headers={"WWW-Authenticate": "Bearer"}
                    )
            else:
                # Log detailed error for debugging but return generic message to prevent enumeration
                logger.debug(f"API key validation failed: {validation_result.error_message}")
                raise HTTPException(
                    status_code=401,
                    detail="Invalid API key",
                    headers={"WWW-Authenticate": "Bearer"}
                )
        except HTTPException:
            raise
        except Exception as e:
            structlog.get_logger().error(f"Error validating API key: {e}")
            raise HTTPException(
                status_code=401,
                detail="API key validation failed",
                headers={"WWW-Authenticate": "Bearer"}
            )

    auth_header = request.headers.get('Authorization')

    if not auth_header or not auth_header.startswith('Bearer '):
        # Also check for session token in cookies (better-auth cross-subdomain)
        # Support both "recoder" prefix (configured) and "better-auth" prefix (default)
        session_token = (
            request.cookies.get("recoder.session_token")
            or request.cookies.get("__Secure-recoder.session_token")
            or request.cookies.get("better-auth.session_token")
            or request.cookies.get("__Secure-better-auth.session_token")
        )
        if session_token:
            user_id = await verify_session_token_cached(session_token)
            if user_id:
                structlog.contextvars.bind_contextvars(
                    user_id=user_id,
                    auth_method="session_cookie"
                )
                return user_id
        raise HTTPException(
            status_code=401,
            detail="No valid authentication credentials found",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = auth_header.split(' ')[1]

    user_id = await verify_session_token_cached(token)
    if user_id:
        structlog.contextvars.bind_contextvars(
            user_id=user_id,
            auth_method="session_token"
        )
        return user_id

    raise HTTPException(
        status_code=401,
        detail="Invalid or expired session token",
        headers={"WWW-Authenticate": "Bearer"}
    )


async def get_optional_user_id_from_jwt(request: Request) -> Optional[str]:
    try:
        return await verify_and_get_user_id_from_jwt(request)
    except HTTPException:
        return None

    
async def get_user_id_from_stream_auth(
    request: Request,
    token: Optional[str] = None
) -> str:
    """
    Authenticate user for streaming endpoints using better-auth session tokens.
    Supports Authorization/cookie tokens and token query param.
    """
    logger.debug(f"get_user_id_from_stream_auth called - has_token: {bool(token)}")

    try:
        # Try header/cookie auth first.
        try:
            user_id = await verify_and_get_user_id_from_jwt(request)
            logger.debug(f"Authenticated via header/cookie: {user_id[:8]}...")
            return user_id
        except HTTPException:
            pass

        # Try token query param (for SSE/EventSource which can't set headers)
        if token:
            user_id = await verify_session_token_cached(token)
            if user_id:
                structlog.contextvars.bind_contextvars(
                    user_id=user_id,
                    auth_method="session_query"
                )
                logger.debug(f"Authenticated via session token param: {user_id[:8]}...")
                return user_id

        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "cannot schedule new futures after shutdown" in error_msg or "connection is closed" in error_msg:
            raise HTTPException(status_code=503, detail="Server is shutting down")
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

async def get_optional_user_id(request: Request) -> Optional[str]:
    # Check session cookies first (better-auth)
    # Support both "recoder" prefix (configured) and "better-auth" prefix (default)
    session_token = (
        request.cookies.get("recoder.session_token")
        or request.cookies.get("__Secure-recoder.session_token")
        or request.cookies.get("better-auth.session_token")
        or request.cookies.get("__Secure-better-auth.session_token")
    )
    if session_token:
        user_id = await verify_session_token_cached(session_token)
        if user_id:
            structlog.contextvars.bind_contextvars(user_id=user_id)
            return user_id

    auth_header = request.headers.get('Authorization')

    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ')[1]

    user_id = await verify_session_token_cached(token)
    if user_id:
        structlog.contextvars.bind_contextvars(user_id=user_id)
        return user_id

    return None

get_optional_current_user_id_from_jwt = get_optional_user_id

async def verify_and_get_agent_authorization(agent_id: str, user_id: str) -> dict:
    try:
        from core.services.db import execute_one

        agent_result = await execute_one(
            "SELECT * FROM agents WHERE agent_id::text = :agent_id AND account_id::text = :user_id LIMIT 1",
            {"agent_id": agent_id, "user_id": user_id},
        )

        if not agent_result:
            raise HTTPException(status_code=404, detail="Worker not found or access denied")

        return agent_result
        
    except HTTPException:
        raise
    except Exception as e:
        structlog.error(f"Error verifying agent access for agent {agent_id}, user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify agent access")

async def verify_and_authorize_thread_access(client, thread_id: str, user_id: Optional[str], require_write_access: bool = False):
    """
    Verify that a user has access to a thread.
    Supports both authenticated and anonymous access (for public threads).
    
    Args:
        client: Reserved for backward compatibility (unused)
        thread_id: Thread ID to check
        user_id: User ID (can be None for anonymous users accessing public threads)
        require_write_access: If True, public threads only grant read access (default False for backward compatibility)
    """
    from core.services.db import execute_one
    
    try:
        # Use different queries for authenticated vs anonymous users to avoid UUID type errors
        if user_id:
            # Full query with user role checks for authenticated users
            sql = """
            SELECT 
                t.thread_id,
                t.account_id,
                p.is_public as project_is_public,
                COALESCE(ur.role::text, '') as user_role,
                CASE WHEN au.user_id IS NOT NULL THEN true ELSE false END as is_team_member
            FROM threads t
            LEFT JOIN projects p ON t.project_id::text = p.project_id::text
            LEFT JOIN user_roles ur ON ur.user_id::text = :user_id
            LEFT JOIN basejump.account_user au ON au.account_id::text = t.account_id::text AND au.user_id::text = :user_id
            WHERE t.thread_id::text = :thread_id
            """
            result = await execute_one(sql, {"thread_id": thread_id, "user_id": user_id})
        else:
            # Simple query for anonymous users - only need thread and public status
            sql = """
            SELECT 
                t.thread_id,
                t.account_id,
                p.is_public as project_is_public
            FROM threads t
            LEFT JOIN projects p ON t.project_id::text = p.project_id::text
            WHERE t.thread_id::text = :thread_id
            """
            result = await execute_one(sql, {"thread_id": thread_id})
        
        if not result:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        # Check if project is public - allow anonymous READ access only
        if result.get('project_is_public'):
            if require_write_access:
                # Public threads are read-only for non-owners
                # Continue to check if user is owner/team member/admin
                structlog.get_logger().debug(f"Public thread write access requested, checking ownership: {thread_id}")
            else:
                structlog.get_logger().debug(f"Public thread read access granted: {thread_id}")
                return True
        
        # If not public (or write access required), user must be authenticated
        if not user_id:
            if require_write_access:
                raise HTTPException(status_code=403, detail="Authentication required to modify this thread")
            raise HTTPException(status_code=403, detail="Authentication required for private threads")
        
        # Check if user is an admin (admins have access to all threads)
        user_role = result.get('user_role', '')
        if user_role in ('admin', 'super_admin'):
            structlog.get_logger().debug(f"Admin access granted for thread {thread_id}", user_role=user_role)
            return True
        
        # Check if user owns the thread
        if result.get('account_id') == user_id:
            return True
        
        # Check if user is a team member of the account
        if result.get('is_team_member'):
            return True
        
        if require_write_access:
            raise HTTPException(status_code=403, detail="Not authorized to modify this thread")
        raise HTTPException(status_code=403, detail="Not authorized to access this thread")
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "cannot schedule new futures after shutdown" in error_msg or "connection is closed" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Server is shutting down"
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Error verifying thread access: {str(e)}"
            )


async def get_authorized_user_for_thread(
    thread_id: str,
    request: Request,
    require_write_access: bool = False
) -> str:
    """
    FastAPI dependency that verifies session/API-key auth and authorizes thread access.
    
    Args:
        thread_id: The thread ID to authorize access for
        request: The FastAPI request object
        require_write_access: If True, requires write access (not just public read access)
        
    Returns:
        str: The authenticated and authorized user ID
        
    Raises:
        HTTPException: If authentication fails or user lacks thread access
    """
    # First, authenticate the user
    user_id = await verify_and_get_user_id_from_jwt(request)

    # Then, authorize thread access
    await verify_and_authorize_thread_access(None, thread_id, user_id, require_write_access=require_write_access)
    
    return user_id

async def get_authorized_user_for_agent(
    agent_id: str,
    request: Request
) -> tuple[str, dict]:
    """
    FastAPI dependency that verifies session/API-key auth and authorizes agent access.
    
    Args:
        agent_id: The agent ID to authorize access for
        request: The FastAPI request object
        
    Returns:
        tuple[str, dict]: The authenticated user ID and agent data
        
    Raises:
        HTTPException: If authentication fails or user lacks agent access
    """
    # First, authenticate the user
    user_id = await verify_and_get_user_id_from_jwt(request)

    # Then, authorize agent access and get agent data
    agent_data = await verify_and_get_agent_authorization(agent_id, user_id)
    
    return user_id, agent_data

class AuthorizedThreadAccess:
    """
    FastAPI dependency that combines authentication and thread authorization.
    
    Usage:
        @router.get("/threads/{thread_id}/messages")
        async def get_messages(
            thread_id: str,
            auth: AuthorizedThreadAccess = Depends()
        ):
            user_id = auth.user_id  # Authenticated and authorized user
    """
    def __init__(self, user_id: str):
        self.user_id = user_id

class AuthorizedAgentAccess:
    """
    FastAPI dependency that combines authentication and agent authorization.
    
    Usage:
        @router.get("/agents/{agent_id}/config")  
        async def get_agent_config(
            agent_id: str,
            auth: AuthorizedAgentAccess = Depends()
        ):
            user_id = auth.user_id       # Authenticated and authorized user
            agent_data = auth.agent_data # Agent data from authorization check
    """
    def __init__(self, user_id: str, agent_data: dict):
        self.user_id = user_id
        self.agent_data = agent_data

async def require_thread_access(
    thread_id: str,
    request: Request
) -> AuthorizedThreadAccess:
    """
    FastAPI dependency that verifies auth and authorizes thread access (read-only).
    For public threads, allows read access to anyone.
    
    Args:
        thread_id: The thread ID from the path parameter
        request: The FastAPI request object
        
    Returns:
        AuthorizedThreadAccess: Object containing authenticated user_id
        
    Raises:
        HTTPException: If authentication fails or user lacks thread access
    """
    user_id = await get_authorized_user_for_thread(thread_id, request, require_write_access=False)
    return AuthorizedThreadAccess(user_id)

async def require_thread_write_access(
    thread_id: str,
    request: Request
) -> AuthorizedThreadAccess:
    """
    FastAPI dependency that verifies auth and authorizes thread WRITE access.
    Public threads only grant read access - this ensures only owners/team members/admins can modify.
    
    Args:
        thread_id: The thread ID from the path parameter
        request: The FastAPI request object
        
    Returns:
        AuthorizedThreadAccess: Object containing authenticated user_id
        
    Raises:
        HTTPException: If authentication fails or user lacks write access to thread
    """
    user_id = await get_authorized_user_for_thread(thread_id, request, require_write_access=True)
    return AuthorizedThreadAccess(user_id)

async def require_agent_access(
    agent_id: str,
    request: Request
) -> AuthorizedAgentAccess:
    """
    FastAPI dependency that verifies auth and authorizes agent access.
    
    Args:
        agent_id: The agent ID from the path parameter
        request: The FastAPI request object
        
    Returns:
        AuthorizedAgentAccess: Object containing user_id and agent_data
        
    Raises:
        HTTPException: If authentication fails or user lacks agent access
    """
    user_id, agent_data = await get_authorized_user_for_agent(agent_id, request)
    return AuthorizedAgentAccess(user_id, agent_data)

# ============================================================================
# Sandbox Authorization Functions
# ============================================================================

async def verify_sandbox_access(client, sandbox_id: str, user_id: str):
    """
    Verify that a user has access to a specific sandbox by checking resource ownership and project permissions.
    
    This function implements account-based resource access control:
    - Find the resource by external_id (sandbox_id)
    - Check if user has access to the resource's account
    - Public projects: Allow access to anyone
    - Private projects: Only allow access to account members
    
    Args:
        client: Reserved for backward compatibility (unused)
        sandbox_id: The sandbox ID (external_id) to check access for
        user_id: The user ID to check permissions for (required for all operations)
        
    Returns:
        dict: Project data containing sandbox information
        
    Raises:
        HTTPException: If the user doesn't have access to the project/sandbox or sandbox doesn't exist
    """
    from core.services.db import execute_one
    
    sql = """
    SELECT 
        r.id as resource_id,
        r.account_id as resource_account_id,
        r.config as resource_config,
        p.project_id,
        p.account_id as project_account_id,
        p.is_public,
        p.name as project_name,
        p.description as project_description,
        p.sandbox_resource_id,
        p.created_at as project_created_at,
        p.updated_at as project_updated_at,
        COALESCE(ur.role::text, '') as user_role,
        CASE WHEN au_resource.user_id IS NOT NULL THEN true ELSE false END as is_resource_team_member,
        CASE WHEN au_project.user_id IS NOT NULL THEN true ELSE false END as is_project_team_member
    FROM resources r
    LEFT JOIN projects p ON p.sandbox_resource_id::text = r.id::text
    LEFT JOIN user_roles ur ON ur.user_id::text = :user_id
    LEFT JOIN basejump.account_user au_resource ON au_resource.account_id::text = r.account_id::text AND au_resource.user_id::text = :user_id
    LEFT JOIN basejump.account_user au_project ON au_project.account_id::text = p.account_id::text AND au_project.user_id::text = :user_id
    WHERE r.external_id = :sandbox_id AND r.type = 'sandbox'
    """
    
    result = await execute_one(sql, {"sandbox_id": sandbox_id, "user_id": user_id})
    
    if not result:
        raise HTTPException(status_code=404, detail="Sandbox not found - no resource exists for this sandbox")
    
    resource_account_id = result.get('resource_account_id')
    project_id = result.get('project_id')
    is_public = result.get('is_public', False)
    user_role = result.get('user_role', '')
    is_resource_team_member = result.get('is_resource_team_member', False)
    is_project_team_member = result.get('is_project_team_member', False)
    
    # No project uses this resource - check resource account access
    if not project_id:
        if is_resource_team_member:
            structlog.get_logger().debug("User has access to resource via account membership", sandbox_id=sandbox_id, account_id=resource_account_id)
            return {
                'project_id': None,
                'account_id': resource_account_id,
                'is_public': False,
                'sandbox': {
                    'id': sandbox_id,
                    **(result.get('resource_config') or {})
                }
            }
        raise HTTPException(status_code=404, detail="Sandbox not found - no project uses this sandbox")
    
    # Build project data for return
    project_data = {
        'project_id': project_id,
        'account_id': result.get('project_account_id'),
        'is_public': is_public,
        'name': result.get('project_name'),
        'description': result.get('project_description'),
        'sandbox_resource_id': result.get('sandbox_resource_id'),
        'created_at': result.get('project_created_at'),
        'updated_at': result.get('project_updated_at'),
    }
    
    structlog.get_logger().debug(
        "Checking sandbox access via resource ownership",
        sandbox_id=sandbox_id,
        project_id=project_id,
        is_public=is_public,
        user_id=user_id
    )

    # Public projects: Allow access regardless of authentication
    if is_public:
        structlog.get_logger().debug("Allowing access to public project sandbox", project_id=project_id)
        return project_data
    
    # Check if user is an admin (admins have access to all sandboxes)
    if user_role in ('admin', 'super_admin'):
        structlog.get_logger().debug("Admin access granted for sandbox", sandbox_id=sandbox_id, user_role=user_role)
        return project_data
    
    # Check if user is a member of the project's account
    if is_project_team_member:
        structlog.get_logger().debug(
            "User has access to private project sandbox via team membership", 
            project_id=project_id
        )
        return project_data
    
    structlog.get_logger().warning(
        "User denied access to private project sandbox",
        sandbox_id=sandbox_id,
        project_id=project_id,
        user_id=user_id
    )
    raise HTTPException(status_code=403, detail="Not authorized to access this project's sandbox")

async def verify_sandbox_access_optional(client, sandbox_id: str, user_id: Optional[str] = None):
    """
    Verify that a user has access to a specific sandbox by checking resource ownership and project permissions.
    This function supports optional authentication for read-only operations.
    
    This function implements account-based resource access control:
    - Public projects: Allow access to anyone (no authentication required)
    - Private projects: Require authentication and account membership
    
    Args:
        client: Reserved for backward compatibility (unused)
        sandbox_id: The sandbox ID (external_id) to check access for
        user_id: The user ID to check permissions for. Can be None for public project access.
        
    Returns:
        dict: Project data containing sandbox information
        
    Raises:
        HTTPException: If the user doesn't have access to the project/sandbox or sandbox doesn't exist
    """
    from core.services.db import execute_one
    
    # Use different queries for authenticated vs anonymous users to avoid UUID type errors
    if user_id:
        sql = """
        SELECT 
            r.id as resource_id,
            r.account_id as resource_account_id,
            r.config as resource_config,
            p.project_id,
            p.account_id as project_account_id,
            p.is_public,
            p.name as project_name,
            p.description as project_description,
            p.sandbox_resource_id,
            p.created_at as project_created_at,
            p.updated_at as project_updated_at,
            COALESCE(ur.role::text, '') as user_role,
            CASE WHEN au_resource.user_id IS NOT NULL THEN true ELSE false END as is_resource_team_member,
            CASE WHEN au_project.user_id IS NOT NULL THEN true ELSE false END as is_project_team_member
        FROM resources r
        LEFT JOIN projects p ON p.sandbox_resource_id::text = r.id::text
        LEFT JOIN user_roles ur ON ur.user_id::text = :user_id
        LEFT JOIN basejump.account_user au_resource ON au_resource.account_id::text = r.account_id::text AND au_resource.user_id::text = :user_id
        LEFT JOIN basejump.account_user au_project ON au_project.account_id::text = p.account_id::text AND au_project.user_id::text = :user_id
        WHERE r.external_id = :sandbox_id AND r.type = 'sandbox'
        """
        result = await execute_one(sql, {"sandbox_id": sandbox_id, "user_id": user_id})
    else:
        # Simple query for anonymous users - only need resource and public status
        sql = """
        SELECT 
            r.id as resource_id,
            r.account_id as resource_account_id,
            r.config as resource_config,
            p.project_id,
            p.account_id as project_account_id,
            p.is_public,
            p.name as project_name,
            p.description as project_description,
            p.sandbox_resource_id,
            p.created_at as project_created_at,
            p.updated_at as project_updated_at
        FROM resources r
        LEFT JOIN projects p ON p.sandbox_resource_id::text = r.id::text
        WHERE r.external_id = :sandbox_id AND r.type = 'sandbox'
        """
        result = await execute_one(sql, {"sandbox_id": sandbox_id})
    
    if not result:
        raise HTTPException(status_code=404, detail="Sandbox not found - no resource exists for this sandbox")
    
    resource_account_id = result.get('resource_account_id')
    project_id = result.get('project_id')
    is_public = result.get('is_public', False)
    user_role = result.get('user_role', '')
    is_resource_team_member = result.get('is_resource_team_member', False)
    is_project_team_member = result.get('is_project_team_member', False)
    
    # No project uses this resource
    if not project_id:
        if user_id and is_resource_team_member:
            structlog.get_logger().debug("User has access to resource via account membership", sandbox_id=sandbox_id, account_id=resource_account_id)
            return {
                'project_id': None,
                'account_id': resource_account_id,
                'is_public': False,
                'sandbox': {
                    'id': sandbox_id,
                    **(result.get('resource_config') or {})
                }
            }
        raise HTTPException(status_code=404, detail="Sandbox not found - no project uses this sandbox")
    
    # Build project data for return
    project_data = {
        'project_id': project_id,
        'account_id': result.get('project_account_id'),
        'is_public': is_public,
        'name': result.get('project_name'),
        'description': result.get('project_description'),
        'sandbox_resource_id': result.get('sandbox_resource_id'),
        'created_at': result.get('project_created_at'),
        'updated_at': result.get('project_updated_at'),
    }
    
    structlog.get_logger().debug(
        "Checking optional sandbox access via resource ownership",
        sandbox_id=sandbox_id,
        project_id=project_id,
        is_public=is_public,
        user_id=user_id
    )

    # Public projects: Allow access regardless of authentication
    if is_public:
        structlog.get_logger().debug("Allowing access to public project sandbox", project_id=project_id)
        return project_data
    
    # Private projects: Require authentication
    if not user_id:
        structlog.get_logger().warning(
            "Authentication required for private project sandbox access",
            project_id=project_id,
            sandbox_id=sandbox_id
        )
        raise HTTPException(status_code=401, detail="Authentication required for this private project")
    
    # Check if user is an admin (admins have access to all sandboxes)
    if user_role in ('admin', 'super_admin'):
        structlog.get_logger().debug("Admin access granted for sandbox", sandbox_id=sandbox_id, user_role=user_role)
        return project_data
    
    # Check if user is a member of the project's account
    if is_project_team_member:
        structlog.get_logger().debug(
            "User has access to private project sandbox via team membership", 
            project_id=project_id
        )
        return project_data
    
    structlog.get_logger().warning(
        "User denied access to private project sandbox",
        sandbox_id=sandbox_id,
        project_id=project_id,
        user_id=user_id
    )
    raise HTTPException(status_code=403, detail="Not authorized to access this project's sandbox")
