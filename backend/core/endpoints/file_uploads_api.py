from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import Table, execute_read
from core.utils.logger import logger
from core.services.storage import create_signed_url as storage_create_signed_url

router = APIRouter(tags=["file-uploads"])

class RegenerateLinkRequest(BaseModel):
    file_upload_id: Optional[str] = None
    storage_path: Optional[str] = None
    bucket_name: Optional[str] = "file-uploads"

class RegenerateLinkResponse(BaseModel):
    success: bool
    signed_url: str
    expires_at: str
    message: str

@router.post("/file-uploads/regenerate-link")
async def regenerate_signed_link(
    request: RegenerateLinkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    try:
        account_rows = await execute_read(
            "SELECT account_id FROM basejump.account_user WHERE user_id = :user_id",
            {"user_id": user_id}
        )
        if not account_rows:
            raise HTTPException(status_code=403, detail="User not found in any account")

        user_account_ids = [acc['account_id'] for acc in account_rows]

        file_uploads_table = Table("file_uploads")

        if request.file_upload_id:
            file_upload = await file_uploads_table.get("id", request.file_upload_id)

            if not file_upload:
                raise HTTPException(status_code=404, detail="File upload not found")

            if file_upload['account_id'] not in user_account_ids:
                raise HTTPException(status_code=403, detail="Access denied to this file")

            bucket_name = file_upload['bucket_name']
            storage_path = file_upload['storage_path']
            file_id_to_update = request.file_upload_id

        elif request.storage_path:
            bucket_name = request.bucket_name or "file-uploads"
            storage_path = request.storage_path

            account_id_from_path = storage_path.split('/')[0]
            if account_id_from_path not in user_account_ids:
                raise HTTPException(status_code=403, detail="Access denied to this file")

            file_upload_row = await file_uploads_table.get_by(
                filters={"storage_path": storage_path, "bucket_name": bucket_name},
                cols="id"
            )
            file_id_to_update = file_upload_row['id'] if file_upload_row else None
        else:
            raise HTTPException(status_code=400, detail="Either file_upload_id or storage_path must be provided")

        expires_in = 24 * 60 * 60
        signed_url = await storage_create_signed_url(bucket_name, storage_path, expires_in)
        if not signed_url:
            raise HTTPException(status_code=500, detail="Failed to generate signed URL")

        url_expires_at = datetime.now() + timedelta(seconds=expires_in)

        if file_id_to_update:
            await file_uploads_table.update("id", file_id_to_update, {
                'signed_url': signed_url,
                'url_expires_at': url_expires_at.isoformat()
            })

        return RegenerateLinkResponse(
            success=True,
            signed_url=signed_url,
            expires_at=url_expires_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
            message=f"Secure URL regenerated successfully. Expires in 24 hours."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to regenerate signed link: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate link: {str(e)}")

@router.get("/file-uploads/{file_upload_id}")
async def get_file_upload(
    file_upload_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    try:
        file_upload = await Table("file_uploads").get("id", file_upload_id)

        if not file_upload:
            raise HTTPException(status_code=404, detail="File upload not found")

        account_rows = await execute_read(
            "SELECT account_id FROM basejump.account_user WHERE user_id = :user_id",
            {"user_id": user_id}
        )
        if not account_rows:
            raise HTTPException(status_code=403, detail="User not found in any account")

        user_account_ids = [acc['account_id'] for acc in account_rows]
        if file_upload['account_id'] not in user_account_ids:
            raise HTTPException(status_code=403, detail="Access denied to this file")

        return file_upload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get file upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get file upload: {str(e)}")
