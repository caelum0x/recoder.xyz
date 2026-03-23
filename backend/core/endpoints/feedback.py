import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import Table, execute_one, execute_read, serialize_row

router = APIRouter(tags=["feedback"])


class FeedbackRequest(BaseModel):
    """Request model for submitting feedback."""
    rating: int
    feedback_text: Optional[str] = None
    help_improve: bool = True
    thread_id: Optional[str] = None  # Optional - feedback can be standalone
    message_id: Optional[str] = None  # Optional - feedback can be standalone
    context: Optional[dict] = None  # Additional context/metadata


class FeedbackResponse(BaseModel):
    """Response model for feedback."""
    feedback_id: str
    thread_id: Optional[str] = None
    message_id: Optional[str] = None
    account_id: str
    rating: float
    feedback_text: Optional[str] = None
    help_improve: bool
    context: Optional[dict] = None
    created_at: str
    updated_at: str


feedback_table = Table("feedback").json_columns("context")


@router.post("/feedback", response_model=FeedbackResponse, summary="Submit Feedback", operation_id="submit_feedback")
async def submit_feedback(
    feedback_data: FeedbackRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Submit feedback (rating and optional text). Can be associated with a thread/message or standalone."""
    logger.debug(f"Submitting feedback from user {user_id}")

    try:
        # Validate rating (1 to 5, whole numbers only)
        if feedback_data.rating < 1 or feedback_data.rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

        # If thread_id and message_id are provided, verify they exist and user has access
        if feedback_data.thread_id:
            from core.utils.auth_utils import verify_and_authorize_thread_access
            await verify_and_authorize_thread_access(None, feedback_data.thread_id, user_id)

            if feedback_data.message_id:
                # Verify message exists and belongs to thread
                message_row = await execute_one(
                    "SELECT message_id FROM messages WHERE message_id = :message_id AND thread_id = :thread_id",
                    {"message_id": feedback_data.message_id, "thread_id": feedback_data.thread_id}
                )
                if not message_row:
                    raise HTTPException(status_code=404, detail="Message not found in thread")

        # Check if feedback already exists (for thread_id + message_id combination)
        existing_feedback = None
        if feedback_data.thread_id and feedback_data.message_id:
            existing_feedback = await feedback_table.get_by(filters={
                "thread_id": feedback_data.thread_id,
                "message_id": feedback_data.message_id,
                "account_id": user_id
            })

        feedback_payload = {
            "account_id": user_id,
            "rating": int(feedback_data.rating),
            "feedback_text": feedback_data.feedback_text,
            "help_improve": feedback_data.help_improve,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        # Add optional fields
        if feedback_data.thread_id:
            feedback_payload["thread_id"] = feedback_data.thread_id
        if feedback_data.message_id:
            feedback_payload["message_id"] = feedback_data.message_id
        if feedback_data.context:
            feedback_payload["context"] = feedback_data.context

        if existing_feedback:
            # Update existing feedback
            updated = await feedback_table.update("feedback_id", existing_feedback['feedback_id'], feedback_payload)
            if not updated:
                raise HTTPException(status_code=500, detail="Failed to update feedback")
            logger.debug(f"Updated feedback {updated['feedback_id']}")
            return serialize_row(updated)
        else:
            # Insert new feedback
            feedback_payload["feedback_id"] = str(uuid.uuid4())
            feedback_payload["created_at"] = datetime.now(timezone.utc).isoformat()
            inserted = await feedback_table.insert(feedback_payload)
            if not inserted:
                raise HTTPException(status_code=500, detail="Failed to create feedback")
            logger.debug(f"Created feedback {inserted['feedback_id']}")
            return serialize_row(inserted)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(e)}")


@router.get("/feedback", response_model=list[FeedbackResponse], summary="Get Feedback", operation_id="get_feedback")
async def get_feedback(
    thread_id: Optional[str] = None,
    message_id: Optional[str] = None,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get feedback. Can filter by thread_id and/or message_id. Returns user's own feedback."""
    logger.debug(f"Getting feedback for user {user_id}")

    try:
        if thread_id:
            # Verify thread access
            from core.utils.auth_utils import verify_and_authorize_thread_access
            await verify_and_authorize_thread_access(None, thread_id, user_id)

        # Build filters
        filters = {"account_id": user_id}
        if thread_id:
            filters["thread_id"] = thread_id
        if message_id:
            filters["message_id"] = message_id

        feedback_result = await feedback_table.list(filters=filters, limit=1000)

        return [serialize_row(r) for r in (feedback_result or [])]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get feedback: {str(e)}")


@router.get("/feedback/{feedback_id}", response_model=Optional[FeedbackResponse], summary="Get Feedback by ID", operation_id="get_feedback_by_id")
async def get_feedback_by_id(
    feedback_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get a specific feedback by ID (only if it belongs to the current user)."""
    logger.debug(f"Getting feedback {feedback_id} for user {user_id}")

    try:
        feedback_row = await feedback_table.get_by(filters={
            "feedback_id": feedback_id,
            "account_id": user_id
        })

        if not feedback_row:
            return None

        return serialize_row(feedback_row)

    except Exception as e:
        logger.error(f"Error getting feedback {feedback_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get feedback: {str(e)}")
