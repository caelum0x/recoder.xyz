import os
import uuid
import mimetypes
import structlog
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.services.storage import upload_file as storage_upload, create_signed_url as storage_create_signed_url
from core.services.db import Table, execute_one_read, execute_read
from core.utils.logger import logger
from core.utils.config import config

@tool_metadata(
    display_name="File Upload",
    description="Upload files to cloud storage and share them with secure links",
    icon="Upload",
    color="bg-teal-100 dark:bg-teal-800/50",
    weight=230,
    visible=True,
    usage_guide="""
### FILE UPLOAD & CLOUD STORAGE

**PURPOSE:** Upload files from sandbox workspace to private cloud storage (S3-compatible) with secure signed URLs

**WHEN TO USE:**
- **ONLY when user explicitly requests file sharing** or asks for permanent URLs
- **ONLY when user asks for files to be accessible externally** or beyond sandbox session
- **ASK USER FIRST** in most cases: "Would you like me to upload this file to secure cloud storage for sharing?"
- User specifically requests file sharing or external access
- User asks for permanent or persistent file access
- **DO NOT automatically upload** unless explicitly requested

**UPLOAD PARAMETERS:**
- `file_path`: Path relative to /workspace (e.g., "report.pdf", "data/results.csv")
- `custom_filename`: Optional custom name for the uploaded file

**STORAGE:**
- Files stored in secure private storage with user isolation
- Signed URL access with 24-hour expiration
- Each user can only access their own files

**UPLOAD WORKFLOW:**
1. Ask before uploading: "Would you like me to upload this file to secure cloud storage for sharing?"
2. If user says yes: Use upload_file with file_path parameter
3. Share the secure URL (note: expires in 24 hours)

**INTEGRATED WORKFLOW:**
- Create file → Ask user if upload needed → Upload only if requested → Share secure URL
- Generate image → Ask about cloud storage → Upload only if requested
- Browser screenshots: Continue automatic upload (no changes)
"""
)
class SandboxUploadFileTool(SandboxToolsBase):
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "upload_file",
            "description": "Securely upload a file from the sandbox workspace to private cloud storage. Returns a secure signed URL that expires after 24 hours for access control and security. **🚨 PARAMETER NAMES**: Use EXACTLY these parameter names: `file_path` (REQUIRED), `custom_filename` (optional).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "**REQUIRED** - Path to the file in the sandbox, relative to /workspace. Example: 'output.pdf', 'data/results.csv'"
                    },
                    "custom_filename": {
                        "type": "string",
                        "description": "**OPTIONAL** - Custom filename for the uploaded file. If not provided, uses original filename with timestamp."
                    }
                },
                "required": ["file_path"],
                "additionalProperties": False
            }
        }
    })
    async def upload_file(
        self,
        file_path: str,
        custom_filename: Optional[str] = None
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            try:
                file_info = await self.sandbox.fs.get_file_info(full_path)
                if file_info.size > 50 * 1024 * 1024:  # 50MB limit
                    return self.fail_response(f"File '{file_path}' is too large (>50MB). Please reduce file size before uploading.")
            except Exception:
                return self.fail_response(f"File '{file_path}' not found in workspace.")
            
            try:
                file_content = await self.sandbox.fs.download_file(full_path)
            except Exception as e:
                return self.fail_response(f"Failed to read file '{file_path}': {str(e)}")

            account_id = await self._get_current_account_id()
            
            original_filename = os.path.basename(file_path)
            file_extension = Path(original_filename).suffix.lower()
            content_type, _ = mimetypes.guess_type(original_filename)
            if not content_type:
                content_type = "application/octet-stream"
            
            if custom_filename:
                storage_filename = custom_filename
            else:
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                unique_id = str(uuid.uuid4())[:8]
                name_base = Path(original_filename).stem
                storage_filename = f"{name_base}_{timestamp}_{unique_id}{file_extension}"
            
            storage_path = f"{account_id}/{storage_filename}"
            bucket_name = "file-uploads"  # Always use file-uploads bucket

            try:
                await storage_upload(bucket_name, storage_path, file_content, {"content-type": content_type})

                expires_in = 24 * 60 * 60
                signed_url = await storage_create_signed_url(bucket_name, storage_path, expires_in)
                if not signed_url:
                    return self.fail_response("Failed to generate secure access URL.")
                
                url_expires_at = datetime.now() + timedelta(seconds=expires_in)
                
                file_upload_id = await self._track_upload(
                    client,
                    account_id,
                    storage_path,
                    bucket_name,
                    original_filename,
                    file_info.size,
                    content_type,
                    signed_url,
                    url_expires_at
                )
                
                message = f"🔒 File '{original_filename}' uploaded securely!\n"
                message += f"📁 Storage: {bucket_name}/{storage_path}\n"
                message += f"📏 Size: {self._format_file_size(file_info.size)}\n"
                message += f"🔗 Secure Access URL: {signed_url}\n"
                message += f"⏰ URL expires: {url_expires_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
                if file_upload_id:
                    message += f"📋 File ID: {file_upload_id}\n"
                message += f"\n🔐 This file is stored in private, secure storage with account isolation."
                
                return self.success_response(message)
                
            except Exception as e:
                logger.error(f"Failed to upload file to cloud storage: {str(e)}")
                return self.fail_response(f"Failed to upload file to secure storage: {str(e)}")
                
        except Exception as e:
            logger.error(f"Unexpected error in upload_file: {str(e)}")
            return self.fail_response(f"Unexpected error during secure file upload: {str(e)}")
    
    async def _get_current_account_id(self) -> str:
        """Get account_id from current thread context."""
        context_vars = structlog.contextvars.get_contextvars()
        thread_id = context_vars.get('thread_id')
        
        if not thread_id:
            raise ValueError("No thread_id available from execution context")
        
        from core.utils.auth_utils import get_account_id_from_thread
        return await get_account_id_from_thread(thread_id)
    
    async def _track_upload(
        self,
        client,
        account_id: str,
        storage_path: str,
        bucket_name: str,
        original_filename: str,
        file_size: int,
        content_type: str,
        signed_url: str,
        url_expires_at: datetime
    ):
        try:
            thread_id = None
            agent_id = None
            
            try:
                context_vars = structlog.contextvars.get_contextvars()
                thread_id = context_vars.get('thread_id')
            except Exception:
                pass
            
            if thread_id:
                thread_row = await execute_one_read(
                    "SELECT agent_id FROM threads WHERE thread_id = :thread_id",
                    {"thread_id": thread_id}
                )
                if thread_row:
                    agent_id = thread_row.get('agent_id')

            user_id = None
            try:
                account_row = await execute_one_read(
                    "SELECT user_id FROM basejump.account_user WHERE account_id = :account_id LIMIT 1",
                    {"account_id": account_id}
                )
                if account_row:
                    user_id = account_row.get('user_id')
            except Exception:
                pass

            _file_uploads = Table("file_uploads").json_columns("metadata")
            upload_data = {
                'project_id': self.project_id,
                'thread_id': thread_id,
                'agent_id': agent_id,
                'account_id': account_id,
                'user_id': user_id,
                'bucket_name': bucket_name,
                'storage_path': storage_path,
                'original_filename': original_filename,
                'file_size': file_size,
                'content_type': content_type,
                'signed_url': signed_url,
                'url_expires_at': url_expires_at.isoformat(),
                'metadata': {
                    'uploaded_from': 'sandbox',
                    'tool': 'upload_file',
                    'secure_upload': True
                }
            }

            result = await _file_uploads.insert(upload_data)
            file_upload_id = result['id'] if result else None
            
            return file_upload_id
            
        except Exception as e:
            logger.warning(f"Failed to track file upload in database: {str(e)}")
            return None
    
    def _format_file_size(self, size_bytes: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB" 
