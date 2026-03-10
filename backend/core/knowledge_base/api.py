import os
import re
import shutil
import subprocess
import tempfile
import mimetypes
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field, validator
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, require_agent_access, AuthorizedAgentAccess
from core.services.db import Table, execute, execute_read, execute_one, execute_mutate
from core.services.storage import get_storage_client
from .file_processor import FileProcessor
from core.utils.logger import logger
from core.utils.config import config
from .validation import FileNameValidator, ValidationError, validate_folder_name_unique, validate_file_name_unique_in_folder

# Constants
MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024  # 50MB total limit per user

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


# Helper function to check total file size limit
async def check_total_file_size_limit(account_id: str, new_file_size: int):
    """Check if adding a new file would exceed the total file size limit."""
    try:
        # Get total size of all current entries for this account
        entries = await Table("knowledge_base_entries").list(
            filters={"account_id": account_id, "is_active": True},
            cols="file_size",
            limit=1000
        )

        current_total_size = sum(entry['file_size'] for entry in entries)
        new_total_size = current_total_size + new_file_size

        if new_total_size > MAX_TOTAL_FILE_SIZE:
            current_mb = current_total_size / (1024 * 1024)
            new_mb = new_file_size / (1024 * 1024)
            limit_mb = MAX_TOTAL_FILE_SIZE / (1024 * 1024)

            raise HTTPException(
                status_code=413,
                detail=f"File size limit exceeded. Current total: {current_mb:.1f}MB, New file: {new_mb:.1f}MB, Limit: {limit_mb}MB"
            )

        return True

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking file size limit: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check file size limit")

# Models
class FolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    
    @validator('name')
    def validate_folder_name(cls, v):
        is_valid, error_message = FileNameValidator.validate_name(v, "folder")
        if not is_valid:
            raise ValueError(error_message)
        return FileNameValidator.sanitize_name(v)

class UpdateFolderRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    
    @validator('name')
    def validate_folder_name(cls, v):
        if v is not None:
            is_valid, error_message = FileNameValidator.validate_name(v, "folder")
            if not is_valid:
                raise ValueError(error_message)
            return FileNameValidator.sanitize_name(v)
        return v

class FolderResponse(BaseModel):
    folder_id: str
    name: str
    description: Optional[str]
    entry_count: int
    created_at: str

class EntryResponse(BaseModel):
    entry_id: str
    filename: str
    summary: str
    file_size: int
    created_at: str

class UpdateEntryRequest(BaseModel):
    summary: str = Field(..., min_length=1, max_length=1000)

class AgentAssignmentRequest(BaseModel):
    folder_ids: List[str]

class GitCloneRequest(BaseModel):
    git_url: str = Field(..., min_length=1)
    branch: str = Field(default="main", min_length=1, max_length=255)

    @validator('git_url')
    def validate_git_url(cls, v):
        v = v.strip()
        # Allow HTTPS git URLs only (no SSH/local paths for security)
        if not re.match(r'^https?://', v):
            raise ValueError('Only HTTPS Git URLs are supported')
        # Basic URL structure validation
        if not re.match(r'^https?://[a-zA-Z0-9._\-]+\.[a-zA-Z]{2,}/', v):
            raise ValueError('Invalid Git repository URL')
        return v

    @validator('branch')
    def validate_branch(cls, v):
        v = v.strip()
        # Reject shell injection characters
        if re.search(r'[;&|`$(){}]', v):
            raise ValueError('Invalid branch name')
        return v

file_processor = FileProcessor()

# Folder management
@router.get("/folders", response_model=List[FolderResponse])
async def get_folders(user_id: str = Depends(verify_and_get_user_id_from_jwt)):
    """Get all knowledge base folders for user."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        return []
    
    try:
        account_id = user_id

        folder_rows = await Table("knowledge_base_folders").list(
            filters={"account_id": account_id},
            cols="folder_id, name, description, created_at",
            order_by="created_at DESC",
            limit=1000
        )

        folders = []
        for folder_data in folder_rows:
            # Count entries in folder
            entry_count = await Table("knowledge_base_entries").count(
                filters={"folder_id": folder_data['folder_id']}
            )

            folders.append(FolderResponse(
                folder_id=folder_data['folder_id'],
                name=folder_data['name'],
                description=folder_data['description'],
                entry_count=entry_count,
                created_at=folder_data['created_at']
            ))

        return folders

    except Exception as e:
        logger.error(f"Error getting folders: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve folders")

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder_data: FolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Create a new knowledge base folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Get existing folder names to check for conflicts
        existing_rows = await Table("knowledge_base_folders").list(
            filters={"account_id": account_id},
            cols="name",
            limit=1000
        )
        existing_names = [folder['name'] for folder in existing_rows]

        # Generate unique name if there's a conflict
        final_name = FileNameValidator.generate_unique_name(folder_data.name, existing_names, "folder")

        insert_data = {
            'account_id': account_id,
            'name': final_name,
            'description': folder_data.description
        }

        created_folder = await Table("knowledge_base_folders").insert(insert_data)

        if not created_folder:
            raise HTTPException(status_code=500, detail="Failed to create folder")

        return FolderResponse(
            folder_id=created_folder['folder_id'],
            name=created_folder['name'],
            description=created_folder['description'],
            entry_count=0,
            created_at=created_folder['created_at']
        )

    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create folder")

@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    folder_data: UpdateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update a knowledge base folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Verify ownership and get current folder
        current_folder = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": folder_id, "account_id": account_id},
            cols="folder_id, name, description, created_at"
        )

        if not current_folder:
            raise HTTPException(status_code=404, detail="Folder not found")

        # Build update data with only provided fields
        update_data = {}
        if folder_data.name is not None:
            # Validate name uniqueness (excluding current folder)
            await validate_folder_name_unique(folder_data.name, account_id, folder_id)
            update_data['name'] = folder_data.name
        if folder_data.description is not None:
            update_data['description'] = folder_data.description

        # If no fields to update, return current folder
        if not update_data:
            entry_count = await Table("knowledge_base_entries").count(
                filters={"folder_id": folder_id}
            )

            return FolderResponse(
                folder_id=current_folder['folder_id'],
                name=current_folder['name'],
                description=current_folder['description'],
                entry_count=entry_count,
                created_at=current_folder['created_at']
            )

        # Update folder
        updated_folder = await Table("knowledge_base_folders").update(
            "folder_id", folder_id, update_data
        )

        if not updated_folder:
            raise HTTPException(status_code=500, detail="Failed to update folder")

        # Count entries in folder
        entry_count = await Table("knowledge_base_entries").count(
            filters={"folder_id": folder_id}
        )

        return FolderResponse(
            folder_id=updated_folder['folder_id'],
            name=updated_folder['name'],
            description=updated_folder['description'],
            entry_count=entry_count,
            created_at=updated_folder['created_at']
        )

    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update folder")

@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Delete a knowledge base folder and all its entries."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Verify ownership
        folder_row = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": folder_id, "account_id": account_id},
            cols="folder_id"
        )

        if not folder_row:
            raise HTTPException(status_code=404, detail="Folder not found")

        # Get all entries in the folder to delete their files from S3
        entry_rows = await Table("knowledge_base_entries").list(
            filters={"folder_id": folder_id},
            cols="entry_id, file_path",
            limit=1000
        )

        # Delete all files from S3 storage
        if entry_rows:
            file_paths = [entry['file_path'] for entry in entry_rows]
            try:
                storage = await get_storage_client()
                await storage.from_('file-uploads').remove(file_paths)
                logger.info(f"Deleted {len(file_paths)} files from S3 for folder {folder_id}")
            except Exception as e:
                logger.warning(f"Failed to delete some files from S3: {str(e)}")

        # Delete folder (cascade will handle entries and assignments in DB)
        await Table("knowledge_base_folders").delete("folder_id", folder_id)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete folder")

# File upload
@router.post("/folders/{folder_id}/upload")
async def upload_file(
    folder_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Upload a file to a knowledge base folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    import time
    start_time = time.time()
    logger.info(f"[UPLOAD] Starting upload for file: {file.filename}")
    
    try:
        account_id = user_id

        # Verify folder ownership
        t1 = time.time()
        folder_row = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": folder_id, "account_id": account_id},
            cols="folder_id"
        )
        logger.info(f"[UPLOAD] Folder verification took: {time.time() - t1:.2f}s")

        if not folder_row:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Validate and sanitize filename
        if not file.filename:
            raise ValidationError("Filename is required")
        
        t2 = time.time()
        is_valid, error_message = FileNameValidator.validate_name(file.filename, "file")
        if not is_valid:
            raise ValidationError(error_message)
        logger.info(f"[UPLOAD] Filename validation took: {time.time() - t2:.2f}s")
        
        # Read file content
        t3 = time.time()
        file_content = await file.read()
        logger.info(f"[UPLOAD] File read ({len(file_content)} bytes) took: {time.time() - t3:.2f}s")
        
        # Check total file size limit before processing
        t4 = time.time()
        await check_total_file_size_limit(account_id, len(file_content))
        logger.info(f"[UPLOAD] Size limit check took: {time.time() - t4:.2f}s")
        
        # Generate unique filename if there's a conflict
        t5 = time.time()
        final_filename = await validate_file_name_unique_in_folder(file.filename, folder_id)
        logger.info(f"[UPLOAD] Filename uniqueness check took: {time.time() - t5:.2f}s")
        
        # Process file in background
        t6 = time.time()
        result = await file_processor.process_file_fast(
            account_id=account_id,
            folder_id=folder_id,
            file_content=file_content,
            filename=final_filename,
            mime_type=file.content_type or 'application/octet-stream',
            background_tasks=background_tasks
        )
        logger.info(f"[UPLOAD] File processing took: {time.time() - t6:.2f}s")
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=result['error'])
        
        # Add info about filename changes
        if final_filename != file.filename:
            result['filename_changed'] = True
            result['original_filename'] = file.filename
            result['final_filename'] = final_filename
        
        logger.info(f"[UPLOAD] Total upload time: {time.time() - start_time:.2f}s")
        return result
        
    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload file")

# Git clone
MAX_CLONE_FILES = 200
MAX_CLONE_TOTAL_SIZE = 50 * 1024 * 1024  # 50MB

@router.post("/folders/{folder_id}/clone-git-repo")
async def clone_git_repo(
    folder_id: str,
    request: GitCloneRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Clone a git repository and import supported files into a KB folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")

    account_id = user_id

    # Verify folder ownership
    folder_row = await Table("knowledge_base_folders").get_by(
        filters={"folder_id": folder_id, "account_id": account_id},
        cols="folder_id"
    )
    if not folder_row:
        raise HTTPException(status_code=404, detail="Folder not found")

    tmp_dir = tempfile.mkdtemp(prefix="kb_git_")
    try:
        # Shallow clone (--depth 1) to minimise bandwidth/disk
        clone_cmd = [
            "git", "clone", "--depth", "1",
            "--branch", request.branch,
            "--single-branch",
            request.git_url,
            tmp_dir,
        ]
        result = subprocess.run(
            clone_cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            err_msg = result.stderr.strip() or "Git clone failed"
            # Sanitise error — don't leak full paths
            if "not found" in err_msg.lower() or "could not read" in err_msg.lower():
                raise HTTPException(status_code=400, detail="Repository not found or not accessible")
            if "Remote branch" in err_msg and "not found" in err_msg:
                raise HTTPException(status_code=400, detail=f"Branch '{request.branch}' not found")
            raise HTTPException(status_code=400, detail="Failed to clone repository")

        # Walk the cloned directory, collect processable files
        files_to_process = []
        total_size = 0

        for root, dirs, filenames in os.walk(tmp_dir):
            # Skip .git directory
            dirs[:] = [d for d in dirs if d != '.git']
            for fname in filenames:
                fpath = os.path.join(root, fname)
                try:
                    fsize = os.path.getsize(fpath)
                except OSError:
                    continue

                # Skip very large individual files (>10MB)
                if fsize > 10 * 1024 * 1024:
                    continue
                # Skip empty files
                if fsize == 0:
                    continue

                ext = Path(fname).suffix.lower()
                mime, _ = mimetypes.guess_type(fname)
                mime = mime or 'application/octet-stream'

                # Determine if file is processable
                is_supported = ext in file_processor.SUPPORTED_EXTENSIONS
                is_text_mime = mime.startswith('text/') or mime in (
                    'application/json', 'application/xml', 'text/xml',
                    'application/javascript', 'application/x-yaml',
                )
                # For unknown mime types, try text detection on small sample
                is_text_file = False
                if not is_supported and not is_text_mime:
                    try:
                        with open(fpath, 'rb') as f:
                            sample = f.read(1024)
                        is_text_file = file_processor._is_likely_text_file(sample)
                    except OSError:
                        continue

                if is_supported or is_text_mime or is_text_file:
                    total_size += fsize
                    if total_size > MAX_CLONE_TOTAL_SIZE:
                        break
                    rel_path = os.path.relpath(fpath, tmp_dir)
                    files_to_process.append((fpath, rel_path, fsize, mime))
                    if len(files_to_process) >= MAX_CLONE_FILES:
                        break
            if len(files_to_process) >= MAX_CLONE_FILES or total_size > MAX_CLONE_TOTAL_SIZE:
                break

        if not files_to_process:
            raise HTTPException(status_code=400, detail="No supported files found in repository")

        # Check account total size limit
        await check_total_file_size_limit(account_id, total_size)

        # Process each file
        processed = []
        errors = []
        for fpath, rel_path, fsize, mime in files_to_process:
            try:
                with open(fpath, 'rb') as f:
                    content = f.read()

                result = await file_processor.process_file_fast(
                    account_id=account_id,
                    folder_id=folder_id,
                    file_content=content,
                    filename=rel_path,
                    mime_type=mime,
                    background_tasks=background_tasks,
                )
                if result.get('success'):
                    processed.append(rel_path)
                else:
                    errors.append({"file": rel_path, "error": result.get('error', 'Unknown error')})
            except Exception as e:
                errors.append({"file": rel_path, "error": str(e)})

        logger.info(f"Git clone complete for folder {folder_id}: {len(processed)} files processed, {len(errors)} errors")

        return {
            "success": True,
            "files_processed": len(processed),
            "files_failed": len(errors),
            "errors": errors[:10] if errors else [],
        }

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Repository clone timed out (120s limit)")
    except Exception as e:
        logger.error(f"Error cloning git repo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clone repository")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# Entries
@router.get("/folders/{folder_id}/entries", response_model=List[EntryResponse])
async def get_folder_entries(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all entries in a folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        return []
    
    try:
        account_id = user_id

        # Verify folder ownership
        folder_row = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": folder_id, "account_id": account_id},
            cols="folder_id"
        )

        if not folder_row:
            raise HTTPException(status_code=404, detail="Folder not found")

        entry_rows = await Table("knowledge_base_entries").list(
            filters={"folder_id": folder_id, "is_active": True},
            cols="entry_id, filename, summary, file_size, created_at",
            order_by="created_at DESC",
            limit=1000
        )

        return [
            EntryResponse(
                entry_id=entry['entry_id'],
                filename=entry['filename'],
                summary=entry['summary'],
                file_size=entry['file_size'],
                created_at=entry['created_at']
            )
            for entry in entry_rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve entries")

# Bulk assign/unassign entries to agents
@router.patch("/entries/bulk-assign")
async def bulk_assign_entries(
    request: BulkAssignRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Bulk assign or unassign knowledge base entries to agents."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")

    try:
        account_id = user_id

        # Validate ownership of all entries
        owned_entries = await Table("knowledge_base_entries").list(
            filters={"account_id": account_id, "is_active": True},
            cols="entry_id",
            limit=10000
        )
        owned_entry_ids = {str(e['entry_id']) for e in owned_entries}

        invalid_entries = [eid for eid in request.entry_ids if eid not in owned_entry_ids]
        if invalid_entries:
            raise HTTPException(
                status_code=404,
                detail=f"Entries not found or not owned: {invalid_entries[:5]}"
            )

        updated_count = 0
        assignments_table = Table("agent_knowledge_entry_assignments")
        affected_agent_ids = set()

        if request.action == "assign":
            for agent_id in request.agent_ids:
                for entry_id in request.entry_ids:
                    try:
                        # Check if assignment already exists
                        existing = await assignments_table.get_by(
                            filters={"agent_id": agent_id, "entry_id": entry_id},
                            cols="assignment_id, enabled"
                        )
                        if existing:
                            # Re-enable if disabled
                            if not existing['enabled']:
                                await assignments_table.update(
                                    "assignment_id", existing['assignment_id'],
                                    {"enabled": True}
                                )
                                updated_count += 1
                                affected_agent_ids.add(agent_id)
                        else:
                            await assignments_table.insert({
                                'agent_id': agent_id,
                                'entry_id': entry_id,
                                'account_id': account_id,
                                'enabled': True
                            })
                            updated_count += 1
                            affected_agent_ids.add(agent_id)
                    except Exception as e:
                        logger.warning(f"Failed to assign entry {entry_id} to agent {agent_id}: {e}")

        elif request.action == "unassign":
            for agent_id in request.agent_ids:
                for entry_id in request.entry_ids:
                    try:
                        existing = await assignments_table.get_by(
                            filters={"agent_id": agent_id, "entry_id": entry_id},
                            cols="assignment_id"
                        )
                        if existing:
                            await assignments_table.delete("assignment_id", existing['assignment_id'])
                            updated_count += 1
                            affected_agent_ids.add(agent_id)
                    except Exception as e:
                        logger.warning(f"Failed to unassign entry {entry_id} from agent {agent_id}: {e}")

        # Invalidate caches for affected agents
        try:
            from core.cache.runtime_cache import invalidate_agent_config_cache, invalidate_kb_context_cache
            for agent_id in affected_agent_ids:
                await invalidate_agent_config_cache(agent_id)
                await invalidate_kb_context_cache(agent_id)
            logger.debug(f"Invalidated cache for {len(affected_agent_ids)} agents after bulk {request.action}")
        except Exception as e:
            logger.warning(f"Failed to invalidate caches after bulk {request.action}: {e}")

        return {
            "success": True,
            "updated_count": updated_count,
            "action": request.action
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk assigning entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to bulk assign entries")


# Bulk move entries between folders
@router.patch("/entries/bulk-move")
async def bulk_move_entries(
    request: BulkMoveRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Bulk move knowledge base entries to a different folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")

    try:
        account_id = user_id

        # Verify target folder exists and belongs to user
        target_folder = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": request.target_folder_id, "account_id": account_id},
            cols="folder_id"
        )
        if not target_folder:
            raise HTTPException(status_code=404, detail="Target folder not found")

        # Get all entries owned by this user that are in the request list
        owned_entries = await Table("knowledge_base_entries").list(
            filters={"account_id": account_id, "is_active": True},
            cols="entry_id, folder_id, file_path, filename",
            limit=10000
        )
        owned_map = {str(e['entry_id']): e for e in owned_entries}

        invalid_entries = [eid for eid in request.entry_ids if eid not in owned_map]
        if invalid_entries:
            raise HTTPException(
                status_code=404,
                detail=f"Entries not found or not owned: {invalid_entries[:5]}"
            )

        moved_count = 0
        for entry_id in request.entry_ids:
            entry = owned_map[entry_id]

            # Skip if already in target folder
            if str(entry['folder_id']) == request.target_folder_id:
                continue

            current_file_path = entry['file_path']
            filename = entry['filename']

            # Build new file path
            sanitized_filename = file_processor.sanitize_filename(filename)
            new_file_path = f"knowledge-base/{request.target_folder_id}/{entry_id}/{sanitized_filename}"

            # Move file in storage
            try:
                storage = await get_storage_client()
                await storage.from_('file-uploads').copy(current_file_path, new_file_path)
                await storage.from_('file-uploads').remove([current_file_path])
            except Exception as storage_error:
                logger.warning(f"Failed to move file in storage for entry {entry_id}: {storage_error}")
                continue

            # Update database record
            await Table("knowledge_base_entries").update(
                "entry_id", entry_id,
                {"folder_id": request.target_folder_id, "file_path": new_file_path}
            )
            moved_count += 1

        logger.info(f"Bulk moved {moved_count}/{len(request.entry_ids)} entries to folder {request.target_folder_id}")

        return {
            "success": True,
            "moved_count": moved_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk moving entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to bulk move entries")


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Delete a knowledge base entry."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Verify ownership
        entry = await Table("knowledge_base_entries").get_by(
            filters={"entry_id": entry_id, "account_id": account_id},
            cols="entry_id, file_path"
        )

        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")

        # Delete from S3
        try:
            storage = await get_storage_client()
            await storage.from_('file-uploads').remove([entry['file_path']])
        except Exception as e:
            logger.warning(f"Failed to delete file from S3: {str(e)}")

        # Delete from database
        await Table("knowledge_base_entries").delete("entry_id", entry_id)

        # Invalidate KB context cache for all agents that had this entry assigned
        try:
            from core.cache.runtime_cache import invalidate_kb_context_cache
            assignment_rows = await Table("agent_knowledge_entry_assignments").list(
                filters={"entry_id": entry_id},
                cols="agent_id",
                limit=1000
            )

            agent_ids = set(row['agent_id'] for row in assignment_rows) if assignment_rows else set()
            for agent_id in agent_ids:
                await invalidate_kb_context_cache(agent_id)
            logger.debug(f"Invalidated KB cache for {len(agent_ids)} agents after entry deletion")
        except Exception as e:
            logger.warning(f"Failed to invalidate KB cache after entry deletion: {e}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete entry")

@router.patch("/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    entry_id: str,
    request: UpdateEntryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update a knowledge base entry summary."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Verify ownership and get current entry
        existing_entry = await Table("knowledge_base_entries").get_by(
            filters={"entry_id": entry_id, "account_id": account_id},
            cols="entry_id, filename, summary, file_size, created_at, account_id"
        )

        if not existing_entry:
            raise HTTPException(status_code=404, detail="Entry not found")

        # Update the summary
        updated_entry = await Table("knowledge_base_entries").update(
            "entry_id", entry_id, {"summary": request.summary}
        )

        if not updated_entry:
            raise HTTPException(status_code=500, detail="Failed to update entry")

        # Invalidate KB context cache for all agents that have this entry assigned
        try:
            from core.cache.runtime_cache import invalidate_kb_context_cache
            assignment_rows = await Table("agent_knowledge_entry_assignments").list(
                filters={"entry_id": entry_id},
                cols="agent_id",
                limit=1000
            )

            agent_ids = set(row['agent_id'] for row in assignment_rows) if assignment_rows else set()
            for agent_id in agent_ids:
                await invalidate_kb_context_cache(agent_id)
            logger.debug(f"Invalidated KB cache for {len(agent_ids)} agents after entry update")
        except Exception as e:
            logger.warning(f"Failed to invalidate KB cache after entry update: {e}")

        # Return the updated entry
        return EntryResponse(
            entry_id=updated_entry['entry_id'],
            filename=updated_entry['filename'],
            summary=updated_entry['summary'],
            file_size=updated_entry['file_size'],
            created_at=updated_entry['created_at']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update entry")

# Agent assignments
@router.get("/agents/{agent_id}/assignments")
async def get_agent_assignments(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access)
):
    """Get entry assignments for an agent."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        return {}
    
    try:
        # Get file-level assignments only
        assignment_rows = await Table("agent_knowledge_entry_assignments").list(
            filters={"agent_id": agent_id},
            cols="entry_id, enabled",
            limit=1000
        )

        return {row['entry_id']: row['enabled'] for row in assignment_rows}

    except Exception as e:
        logger.error(f"Error getting agent assignments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent assignments")

@router.post("/agents/{agent_id}/assignments")
async def update_agent_assignments(
    agent_id: str,
    assignment_data: dict,
    auth: AuthorizedAgentAccess = Depends(require_agent_access)
):
    """Update agent entry assignments."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = auth.user_id
        entry_ids = assignment_data.get('entry_ids', [])

        # Clear existing assignments
        await Table("agent_knowledge_entry_assignments").delete_by(
            filters={"agent_id": agent_id}
        )

        # Insert new entry assignments
        assignments_table = Table("agent_knowledge_entry_assignments")
        for entry_id in entry_ids:
            await assignments_table.insert({
                'agent_id': agent_id,
                'entry_id': entry_id,
                'account_id': account_id,
                'enabled': True
            })

        # Invalidate agent config cache and KB context cache (knowledge base assignments changed)
        try:
            from core.cache.runtime_cache import invalidate_agent_config_cache, invalidate_kb_context_cache
            await invalidate_agent_config_cache(agent_id)
            await invalidate_kb_context_cache(agent_id)
            logger.debug(f"Invalidated cache for agent {agent_id} after knowledge base update")
        except Exception as e:
            logger.warning(f"Failed to invalidate cache for agent {agent_id}: {e}")

        return {"success": True, "message": "Assignments updated successfully"}

    except Exception as e:
        logger.error(f"Error updating agent assignments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update assignments")

class FolderMoveRequest(BaseModel):
    folder_id: str


class BulkAssignRequest(BaseModel):
    entry_ids: List[str] = Field(..., min_length=1)
    agent_ids: List[str] = Field(..., min_length=1)
    action: str = Field(..., pattern="^(assign|unassign)$")

    @validator('action')
    def validate_action(cls, v):
        if v not in ('assign', 'unassign'):
            raise ValueError("action must be 'assign' or 'unassign'")
        return v


class BulkMoveRequest(BaseModel):
    entry_ids: List[str] = Field(..., min_length=1)
    target_folder_id: str


class FolderFileCount(BaseModel):
    folder_id: str
    folder_name: str
    file_count: int


class KnowledgeBaseStatsResponse(BaseModel):
    total_files: int
    total_folders: int
    embedded_count: int
    pending_count: int
    failed_count: int
    total_storage_bytes: int
    per_folder_counts: List[FolderFileCount]


# Search
@router.get("/search")
async def search_knowledge_base_endpoint(
    q: str,
    agent_id: Optional[str] = None,
    limit: int = 20,
    mode: Optional[str] = None,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Search knowledge base entries. Uses semantic search when embeddings are available, falls back to full-text."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        return []

    q = q.strip()
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

    if limit < 1 or limit > 100:
        limit = 20

    try:
        account_id = user_id

        # Try semantic search first (if mode != 'fulltext')
        if mode != 'fulltext':
            try:
                from core.memory.embedding_service import embedding_service
                import json

                query_embedding = await embedding_service.embed_text(q)
                rows = await execute_read(
                    """SELECT * FROM search_knowledge_base_semantic(
                        :account_id, CAST(:embedding AS vector), :query_text, :agent_id, :limit, :threshold
                    )""",
                    {
                        "account_id": account_id,
                        "embedding": json.dumps(query_embedding),
                        "query_text": q,
                        "agent_id": agent_id,
                        "limit": limit,
                        "threshold": 0.25,
                    }
                )

                if rows:
                    return [
                        {
                            "entry_id": str(row["entry_id"]),
                            "folder_id": str(row["folder_id"]),
                            "folder_name": row["folder_name"],
                            "filename": row["filename"],
                            "summary": row["summary"],
                            "file_size": row["file_size"],
                            "created_at": str(row["created_at"]),
                            "rank": float(row["similarity"]) if row["similarity"] else 0.0,
                        }
                        for row in rows
                    ]
            except Exception as e:
                logger.warning(f"Semantic search failed, falling back to full-text: {e}")

        # Fallback to full-text search
        rows = await execute_read(
            """SELECT * FROM search_knowledge_base(
                :account_id, :query, :agent_id, :limit
            )""",
            {
                "account_id": account_id,
                "query": q,
                "agent_id": agent_id,
                "limit": limit,
            }
        )

        return [
            {
                "entry_id": str(row["entry_id"]),
                "folder_id": str(row["folder_id"]),
                "folder_name": row["folder_name"],
                "filename": row["filename"],
                "summary": row["summary"],
                "file_size": row["file_size"],
                "created_at": str(row["created_at"]),
                "rank": float(row["rank"]) if row["rank"] else 0.0,
            }
            for row in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching knowledge base: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search knowledge base")


# Backfill embeddings for entries that don't have them
@router.post("/backfill-embeddings")
async def backfill_embeddings(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Trigger background embedding generation for entries missing embeddings."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")

    try:
        account_id = user_id

        # Find entries without embeddings
        rows = await execute_read(
            """SELECT entry_id, filename, summary
               FROM knowledge_base_entries
               WHERE account_id = :account_id
                 AND is_active = TRUE
                 AND embedding IS NULL
                 AND summary IS NOT NULL
                 AND summary != 'Processing...'
               LIMIT 100""",
            {"account_id": account_id}
        )

        if not rows:
            return {"queued": 0, "message": "All entries already have embeddings"}

        processor = FileProcessor()
        for row in rows:
            background_tasks.add_task(
                processor._generate_and_store_embedding,
                str(row["entry_id"]),
                row["filename"],
                row["summary"],
                row["summary"]  # Use summary as content fallback
            )

        return {"queued": len(rows), "message": f"Queued {len(rows)} entries for embedding generation"}

    except Exception as e:
        logger.error(f"Error backfilling embeddings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to backfill embeddings")


# File download/read
@router.get("/entries/{entry_id}/content")
async def get_entry_content(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get the actual content of a knowledge base file."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")

    try:
        account_id = user_id

        # Get entry details
        entry = await execute_one(
            """SELECT entry_id, filename, file_path, mime_type, file_size
               FROM knowledge_base_entries
               WHERE entry_id = :entry_id AND account_id = :account_id AND is_active = true""",
            {"entry_id": entry_id, "account_id": account_id}
        )

        if not entry:
            raise HTTPException(status_code=404, detail="File not found")

        file_path = entry['file_path']

        # Download file from S3
        try:
            storage = await get_storage_client()
            file_content = await storage.from_('file-uploads').download(file_path)
            if not file_content:
                raise HTTPException(status_code=404, detail="File content not found in storage")
        except Exception as e:
            logger.error(f"Error downloading file from S3: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")

        # Try to decode as text
        content_text = None
        mime_type = entry['mime_type'] or 'application/octet-stream'

        if mime_type.startswith('text/') or mime_type in ['application/json', 'application/xml']:
            try:
                import chardet
                detected = chardet.detect(file_content)
                encoding = detected.get('encoding', 'utf-8')
                content_text = file_content.decode(encoding)
            except Exception:
                logger.warning("Charset detection/decoding failed for entry %s, falling back to utf-8 with replacement", entry.get('entry_id', 'unknown'), exc_info=True)
                content_text = file_content.decode('utf-8', errors='replace')
        elif entry['filename'].endswith('.pdf'):
            try:
                import io
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                content_text = '\n\n'.join(page.extract_text() for page in pdf_reader.pages)
            except Exception as e:
                logger.warning(f"Failed to extract PDF text: {e}")
        elif entry['filename'].endswith('.docx'):
            try:
                import io
                import docx
                doc = docx.Document(io.BytesIO(file_content))
                content_text = '\n'.join(paragraph.text for paragraph in doc.paragraphs)
            except Exception as e:
                logger.warning(f"Failed to extract DOCX text: {e}")
        else:
            # Try generic text decode
            try:
                import chardet
                detected = chardet.detect(file_content[:4096])
                if detected.get('confidence', 0) > 0.7:
                    encoding = detected.get('encoding', 'utf-8')
                    content_text = file_content.decode(encoding)
            except Exception:
                logger.warning("Generic text decoding failed for entry %s, treating as binary", entry.get('entry_id', 'unknown'), exc_info=True)

        return {
            "entry_id": entry['entry_id'],
            "filename": entry['filename'],
            "file_size": entry['file_size'],
            "mime_type": mime_type,
            "content": content_text,
            "is_binary": content_text is None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entry content: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve file content")


# File operations
@router.put("/entries/{entry_id}/move")
async def move_file(
    entry_id: str,
    request: FolderMoveRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Move a file to a different folder."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        raise HTTPException(status_code=503, detail="Knowledge base feature is currently disabled")
    
    try:
        account_id = user_id

        # Get current entry details including file path and filename
        entry = await Table("knowledge_base_entries").get(
            "entry_id", entry_id,
            cols="entry_id, folder_id, file_path, filename"
        )

        if not entry:
            raise HTTPException(status_code=404, detail="File not found")

        current_folder_id = entry['folder_id']
        current_file_path = entry['file_path']
        filename = entry['filename']

        # If already in the target folder, no need to move
        if current_folder_id == request.folder_id:
            return {"success": True, "message": "File is already in the target folder"}

        # Verify target folder belongs to user
        folder_row = await Table("knowledge_base_folders").get_by(
            filters={"folder_id": request.folder_id, "account_id": account_id},
            cols="folder_id"
        )

        if not folder_row:
            raise HTTPException(status_code=404, detail="Target folder not found")

        # Sanitize filename for storage (same logic as file processor)
        sanitized_filename = file_processor.sanitize_filename(filename)

        # Create new file path
        new_file_path = f"knowledge-base/{request.folder_id}/{entry_id}/{sanitized_filename}"

        # Move file in storage
        try:
            storage = await get_storage_client()
            # Copy file to new location
            copy_result = await storage.from_('file-uploads').copy(
                current_file_path, new_file_path
            )

            # Remove old file
            await storage.from_('file-uploads').remove([current_file_path])

        except Exception as storage_error:
            logger.error(f"Error moving file in storage: {str(storage_error)}")
            raise HTTPException(status_code=500, detail="Failed to move file in storage")

        # Update the database with new folder and file path
        await Table("knowledge_base_entries").update(
            "entry_id", entry_id,
            {"folder_id": request.folder_id, "file_path": new_file_path}
        )

        return {"success": True, "message": "File moved successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving file: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to move file")


# Stats
@router.get("/stats", response_model=KnowledgeBaseStatsResponse)
async def get_knowledge_base_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get aggregate statistics for the user's knowledge base."""
    if not config.ENABLE_KNOWLEDGE_BASE:
        return KnowledgeBaseStatsResponse(
            total_files=0, total_folders=0, embedded_count=0,
            pending_count=0, failed_count=0, total_storage_bytes=0,
            per_folder_counts=[]
        )

    try:
        account_id = user_id

        # Count folders
        folder_rows = await Table("knowledge_base_folders").list(
            filters={"account_id": account_id},
            cols="folder_id, name",
            limit=1000
        )
        total_folders = len(folder_rows)

        # Get all active entries for this account
        entry_rows = await Table("knowledge_base_entries").list(
            filters={"account_id": account_id, "is_active": True},
            cols="entry_id, folder_id, file_size, summary",
            limit=10000
        )

        total_files = len(entry_rows)
        total_storage_bytes = sum(entry['file_size'] for entry in entry_rows)

        # Classify entries by embedding status
        # Entries with summary == 'Processing...' are still pending
        # For embedded vs failed, we need to check the embedding column
        pending_count = sum(1 for e in entry_rows if e['summary'] == 'Processing...')
        non_pending_entry_ids = [
            str(e['entry_id']) for e in entry_rows if e['summary'] != 'Processing...'
        ]

        embedded_count = 0
        failed_count = 0
        if non_pending_entry_ids:
            # Query for entries that have embeddings
            embedded_rows = await execute_read(
                """SELECT COUNT(*) as cnt
                   FROM knowledge_base_entries
                   WHERE account_id = :account_id
                     AND is_active = TRUE
                     AND summary != 'Processing...'
                     AND embedding IS NOT NULL""",
                {"account_id": account_id}
            )
            embedded_count = embedded_rows[0]['cnt'] if embedded_rows else 0
            # Failed = non-pending entries without embeddings
            failed_count = len(non_pending_entry_ids) - embedded_count

        # Per-folder file counts
        folder_id_to_name = {str(f['folder_id']): f['name'] for f in folder_rows}
        folder_counts: dict = {}
        for entry in entry_rows:
            fid = str(entry['folder_id'])
            folder_counts[fid] = folder_counts.get(fid, 0) + 1

        per_folder_counts = [
            FolderFileCount(
                folder_id=fid,
                folder_name=folder_id_to_name.get(fid, "Unknown"),
                file_count=count
            )
            for fid, count in folder_counts.items()
        ]

        return KnowledgeBaseStatsResponse(
            total_files=total_files,
            total_folders=total_folders,
            embedded_count=embedded_count,
            pending_count=pending_count,
            failed_count=failed_count,
            total_storage_bytes=total_storage_bytes,
            per_folder_counts=per_folder_counts
        )

    except Exception as e:
        logger.error(f"Error getting knowledge base stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve knowledge base stats")
