"""Service for managing resources (sandboxes, databases, etc.) in the database."""

from typing import Optional, Dict, Any
from datetime import datetime, timezone
from core.utils.logger import logger
from core.resources.resource_types import ResourceType, ResourceStatus, SandboxConfig
from core.services.db import execute, execute_one, execute_mutate


class ResourceService:
    """Service for CRUD operations on resources."""
    
    def __init__(self, client=None):
        """Initialize service. `client` is kept for backward compatibility."""
        self.client = client
    
    async def create_resource(
        self,
        account_id: str,
        resource_type: ResourceType,
        external_id: str,
        config: Dict[str, Any],
        status: ResourceStatus = ResourceStatus.ACTIVE
    ) -> Dict[str, Any]:
        """
        Create a new resource record.
        
        Args:
            account_id: Account that owns this resource
            resource_type: Type of resource (e.g., ResourceType.SANDBOX)
            external_id: External ID (e.g., Daytona sandbox_id)
            config: Configuration dict (e.g., pass, vnc_preview, sandbox_url, token)
            status: Initial status (default: ACTIVE)
            
        Returns:
            Created resource record
        """
        rows = await execute_mutate(
            """
            INSERT INTO resources (
                account_id, type, external_id, status, config, created_at, updated_at
            )
            VALUES (
                :account_id, :type, :external_id, :status, :config, :created_at, :updated_at
            )
            RETURNING *
            """,
            {
                "account_id": account_id,
                "type": resource_type.value,
                "external_id": external_id,
                "status": status.value,
                "config": config,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            },
        )

        if not rows:
            raise Exception("Failed to create resource")

        logger.debug(f"Created resource {rows[0]['id']} of type {resource_type.value} for account {account_id}")
        return rows[0]
    
    async def get_resource_by_id(self, resource_id: str) -> Optional[Dict[str, Any]]:
        """Get a resource by its ID."""
        return await execute_one(
            "SELECT * FROM resources WHERE id = :resource_id LIMIT 1",
            {"resource_id": resource_id},
        )
    
    async def get_resource_by_external_id(
        self,
        external_id: str,
        resource_type: Optional[ResourceType] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a resource by its external ID (e.g., Daytona sandbox_id).
        
        Args:
            external_id: External ID to search for
            resource_type: Optional filter by resource type
        """
        params: Dict[str, Any] = {"external_id": external_id}
        sql = "SELECT * FROM resources WHERE external_id = :external_id"
        if resource_type:
            sql += " AND type = :resource_type"
            params["resource_type"] = resource_type.value
        sql += " LIMIT 1"
        return await execute_one(sql, params)
    
    async def get_account_resources(
        self,
        account_id: str,
        resource_type: Optional[ResourceType] = None,
        status: Optional[ResourceStatus] = None
    ) -> list[Dict[str, Any]]:
        """
        Get all resources for an account, optionally filtered by type and status.
        
        Args:
            account_id: Account ID
            resource_type: Optional filter by resource type
            status: Optional filter by status
        """
        params: Dict[str, Any] = {"account_id": account_id}
        sql = "SELECT * FROM resources WHERE account_id = :account_id"
        if resource_type:
            sql += " AND type = :resource_type"
            params["resource_type"] = resource_type.value
        if status:
            sql += " AND status = :status"
            params["status"] = status.value
        return await execute(sql, params)
    
    async def update_resource(
        self,
        resource_id: str,
        config: Optional[Dict[str, Any]] = None,
        status: Optional[ResourceStatus] = None,
        external_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a resource.
        
        Args:
            resource_id: Resource ID to update
            config: Optional new config dict
            status: Optional new status
            external_id: Optional new external_id
        """
        updates = ["updated_at = :updated_at"]
        params: Dict[str, Any] = {
            "resource_id": resource_id,
            "updated_at": datetime.now(timezone.utc),
        }

        if config is not None:
            updates.append("config = :config")
            params["config"] = config
        if status is not None:
            updates.append("status = :status")
            params["status"] = status.value
        if external_id is not None:
            updates.append("external_id = :external_id")
            params["external_id"] = external_id

        rows = await execute_mutate(
            f"""
            UPDATE resources
            SET {", ".join(updates)}
            WHERE id = :resource_id
            RETURNING *
            """,
            params,
        )

        if not rows:
            raise Exception(f"Failed to update resource {resource_id}")

        logger.debug(f"Updated resource {resource_id}")
        return rows[0]
    
    async def update_last_used(self, resource_id: str) -> None:
        """Update the last_used_at timestamp for a resource."""
        await execute_mutate(
            """
            UPDATE resources
            SET last_used_at = :last_used_at, updated_at = :updated_at
            WHERE id = :resource_id
            """,
            {
                "resource_id": resource_id,
                "last_used_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            },
        )
    
    async def delete_resource(self, resource_id: str) -> bool:
        """
        Delete a resource (soft delete by setting status to DELETED).
        
        Args:
            resource_id: Resource ID to delete
            
        Returns:
            True if deleted successfully
        """
        try:
            await self.update_resource(resource_id, status=ResourceStatus.DELETED)
            logger.debug(f"Deleted resource {resource_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete resource {resource_id}: {str(e)}")
            return False
    
    async def get_project_sandbox_resource(self, project_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the sandbox resource for a project.
        Automatically migrates sandbox data from JSONB if needed.
        
        Args:
            project_id: Project ID
            
        Returns:
            Resource record if found, None otherwise
        """
        # Lazy migration: Migrate sandbox JSONB to resources table if needed
        await self.migrate_project_sandbox_if_needed(project_id)
        
        # Get project with sandbox_resource_id
        project_result = await execute_one(
            """
            SELECT sandbox_resource_id
            FROM projects
            WHERE project_id = :project_id
            LIMIT 1
            """,
            {"project_id": project_id},
        )

        if not project_result:
            return None

        sandbox_resource_id = project_result.get('sandbox_resource_id')
        
        if not sandbox_resource_id:
            return None
        
        return await self.get_resource_by_id(sandbox_resource_id)
    
    async def link_resource_to_project(
        self,
        project_id: str,
        resource_id: str
    ) -> bool:
        """
        Link a resource to a project.
        
        Args:
            project_id: Project ID
            resource_id: Resource ID to link
            
        Returns:
            True if linked successfully
        """
        rows = await execute_mutate(
            """
            UPDATE projects
            SET sandbox_resource_id = :resource_id, updated_at = :updated_at
            WHERE project_id = :project_id
            RETURNING project_id
            """,
            {
                "resource_id": resource_id,
                "project_id": project_id,
                "updated_at": datetime.now(timezone.utc),
            },
        )

        if not rows:
            logger.error(f"Failed to link resource {resource_id} to project {project_id}")
            return False
        
        logger.debug(f"Linked resource {resource_id} to project {project_id}")
        return True
    
    async def migrate_project_sandbox_if_needed(self, project_id: str) -> Optional[Dict[str, Any]]:
        """
        Lazy migration: Migrate sandbox data from projects.sandbox JSONB to resources table.
        This is called automatically when accessing a project to migrate on-demand.
        
        Args:
            project_id: Project ID to check and migrate if needed
            
        Returns:
            Resource record if migration happened, None otherwise
        """
        try:
            # First, check if already migrated (query only columns that always exist)
            project_data = await execute_one(
                """
                SELECT project_id, account_id, sandbox_resource_id
                FROM projects
                WHERE project_id = :project_id
                LIMIT 1
                """,
                {"project_id": project_id},
            )

            if not project_data:
                return None

            sandbox_resource_id = project_data.get('sandbox_resource_id')
            account_id = project_data.get('account_id')
            
            # If already migrated, nothing to do
            if sandbox_resource_id:
                return None
            
            # Try to get sandbox JSONB data (column only exists in production)
            try:
                sandbox_row = await execute_one(
                    """
                    SELECT sandbox
                    FROM projects
                    WHERE project_id = :project_id
                    LIMIT 1
                    """,
                    {"project_id": project_id},
                )
                sandbox_jsonb = sandbox_row.get('sandbox') if sandbox_row else None
            except Exception as col_error:
                # Column doesn't exist in this environment (e.g., local/dev)
                # This is expected - only production has the legacy sandbox column
                if '42703' in str(col_error) or 'does not exist' in str(col_error):
                    return None
                raise  # Re-raise unexpected errors
            
            # If no sandbox data in JSONB, nothing to migrate
            if not sandbox_jsonb or not isinstance(sandbox_jsonb, dict):
                return None
            
            sandbox_id = sandbox_jsonb.get('id')
            if not sandbox_id:
                return None
            
            # Check if resource already exists for this external_id + account_id
            existing_resource = await self.get_resource_by_external_id(
                sandbox_id,
                ResourceType.SANDBOX
            )
            
            if existing_resource:
                # Resource exists, just link it to the project
                resource_id = existing_resource['id']
                if await self.link_resource_to_project(project_id, resource_id):
                    logger.info(f"Lazy migration: Linked existing resource {resource_id} to project {project_id}")
                    return existing_resource
                return None
            
            # Create new resource from sandbox JSONB data
            sandbox_config = {
                'pass': sandbox_jsonb.get('pass'),
                'vnc_preview': sandbox_jsonb.get('vnc_preview'),
                'sandbox_url': sandbox_jsonb.get('sandbox_url'),
                'token': sandbox_jsonb.get('token')
            }
            
            # Remove None values
            sandbox_config = {k: v for k, v in sandbox_config.items() if v is not None}
            
            resource = await self.create_resource(
                account_id=account_id,
                resource_type=ResourceType.SANDBOX,
                external_id=sandbox_id,
                config=sandbox_config,
                status=ResourceStatus.ACTIVE
            )
            
            # Link resource to project
            if await self.link_resource_to_project(project_id, resource['id']):
                logger.info(f"Lazy migration: Migrated sandbox data for project {project_id} to resource {resource['id']}")
                return resource
            else:
                # Cleanup if linking failed
                await self.delete_resource(resource['id'])
                logger.error(f"Lazy migration: Failed to link resource to project {project_id}, cleaned up resource")
                return None
                
        except Exception as e:
            logger.error(f"Lazy migration failed for project {project_id}: {str(e)}", exc_info=True)
            return None
    
    async def get_pooled_sandboxes(self, limit: int = 100) -> list[Dict[str, Any]]:
        return await execute(
            """
            SELECT *
            FROM resources
            WHERE type = :resource_type
              AND status = :status
            ORDER BY pooled_at ASC NULLS LAST
            LIMIT :limit
            """,
            {
                "resource_type": ResourceType.SANDBOX.value,
                "status": ResourceStatus.POOLED.value,
                "limit": limit,
            },
        )
    
    async def get_pooled_sandbox_count(self) -> int:
        row = await execute_one(
            """
            SELECT COUNT(*)::int AS count
            FROM resources
            WHERE type = :resource_type
              AND status = :status
            """,
            {
                "resource_type": ResourceType.SANDBOX.value,
                "status": ResourceStatus.POOLED.value,
            },
        )
        return row.get("count", 0) if row else 0
    
    async def claim_pooled_sandbox(
        self,
        account_id: str,
        project_id: str
    ) -> Optional[Dict[str, Any]]:
        from datetime import datetime, timezone
        
        resource = await execute_one(
            """
            SELECT *
            FROM resources
            WHERE type = :resource_type
              AND status = :status
            ORDER BY pooled_at ASC NULLS LAST
            LIMIT 1
            """,
            {
                "resource_type": ResourceType.SANDBOX.value,
                "status": ResourceStatus.POOLED.value,
            },
        )

        if not resource:
            return None

        resource_id = resource['id']
        now = datetime.now(timezone.utc)

        update_rows = await execute_mutate(
            """
            UPDATE resources
            SET
                account_id = :account_id,
                status = :active_status,
                updated_at = :updated_at,
                pooled_at = NULL
            WHERE id = :resource_id
              AND status = :pooled_status
            RETURNING *
            """,
            {
                "account_id": account_id,
                "active_status": ResourceStatus.ACTIVE.value,
                "updated_at": now,
                "resource_id": resource_id,
                "pooled_status": ResourceStatus.POOLED.value,
            },
        )

        if not update_rows:
            logger.debug(f"Sandbox {resource_id} was claimed by another request, retrying...")
            return await self.claim_pooled_sandbox(account_id, project_id)

        claimed_resource = update_rows[0]
        
        if not await self.link_resource_to_project(project_id, resource_id):
            logger.error(f"Failed to link claimed sandbox {resource_id} to project {project_id}")
        
        logger.info(f"Claimed pooled sandbox {claimed_resource['external_id']} for project {project_id}")
        return claimed_resource


def get_resource_service(client) -> ResourceService:
    return ResourceService(client)
