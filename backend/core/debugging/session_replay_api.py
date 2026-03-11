from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.db import execute, execute_one, execute_mutate, serialize_row, serialize_rows

router = APIRouter(prefix="/sessions", tags=["session-replay"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class StartRecordingRequest(BaseModel):
    thread_id: str
    agent_id: Optional[str] = None
    run_id: Optional[str] = None


class RecordingEventItem(BaseModel):
    type: str
    data: dict = {}
    timestamp: Optional[str] = None


class AppendEventsRequest(BaseModel):
    events: List[RecordingEventItem]


class AddBookmarkRequest(BaseModel):
    event_index: int
    label: str
    note: Optional[str] = None


class RecordingResponse(BaseModel):
    id: str
    user_id: str
    thread_id: str
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    event_count: int
    duration_ms: int
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class RecordingDetailResponse(RecordingResponse):
    events: list = []


class BookmarkResponse(BaseModel):
    id: str
    recording_id: str
    user_id: str
    event_index: int
    label: str
    note: Optional[str] = None
    created_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/recordings", response_model=RecordingResponse)
async def start_recording(
    body: StartRecordingRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Start a new session recording."""
    try:
        row = await execute_one(
            """
            INSERT INTO session_recordings (user_id, thread_id, agent_id, run_id)
            VALUES (:user_id, :thread_id, :agent_id, :run_id)
            RETURNING *
            """,
            {
                "user_id": user_id,
                "thread_id": body.thread_id,
                "agent_id": body.agent_id,
                "run_id": body.run_id,
            },
            commit=True,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create recording")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        raise HTTPException(status_code=500, detail="Failed to start recording")


@router.post("/recordings/{recording_id}/events")
async def append_events(
    recording_id: str,
    body: AppendEventsRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Append events to an existing recording."""
    try:
        # Verify ownership
        existing = await execute_one(
            "SELECT id, event_count FROM session_recordings WHERE id = :id AND user_id = :user_id",
            {"id": recording_id, "user_id": user_id},
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Recording not found")

        events_data = [e.model_dump() for e in body.events]
        new_count = len(events_data)

        row = await execute_one(
            """
            UPDATE session_recordings
            SET events = events || :new_events::jsonb,
                event_count = event_count + :new_count,
                duration_ms = CASE
                    WHEN :new_count > 0
                    THEN EXTRACT(EPOCH FROM (now() - started_at))::INTEGER * 1000
                    ELSE duration_ms
                END
            WHERE id = :id AND user_id = :user_id
            RETURNING id, event_count, duration_ms
            """,
            {
                "id": recording_id,
                "user_id": user_id,
                "new_events": events_data,
                "new_count": new_count,
            },
            commit=True,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to append events")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error appending events: {e}")
        raise HTTPException(status_code=500, detail="Failed to append events")


@router.post("/recordings/{recording_id}/complete", response_model=RecordingResponse)
async def complete_recording(
    recording_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Mark a recording as completed."""
    try:
        row = await execute_one(
            """
            UPDATE session_recordings
            SET status = 'completed',
                completed_at = now(),
                duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::INTEGER * 1000
            WHERE id = :id AND user_id = :user_id AND status = 'recording'
            RETURNING id, user_id, thread_id, agent_id, run_id,
                      event_count, duration_ms, status, started_at, completed_at
            """,
            {"id": recording_id, "user_id": user_id},
            commit=True,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Recording not found or already completed")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing recording: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete recording")


@router.get("/recordings", response_model=List[RecordingResponse])
async def list_recordings(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    thread_id: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List session recordings for the authenticated user."""
    try:
        conditions = ["user_id = :user_id"]
        params: dict = {"user_id": user_id, "limit": limit}

        if thread_id:
            conditions.append("thread_id = :thread_id")
            params["thread_id"] = thread_id
        if agent_id:
            conditions.append("agent_id = :agent_id")
            params["agent_id"] = agent_id
        if status:
            conditions.append("status = :status")
            params["status"] = status

        where = " AND ".join(conditions)
        rows = await execute(
            f"""
            SELECT id, user_id, thread_id, agent_id, run_id,
                   event_count, duration_ms, status, started_at, completed_at
            FROM session_recordings
            WHERE {where}
            ORDER BY started_at DESC
            LIMIT :limit
            """,
            params,
        )
        return serialize_rows(rows)
    except Exception as e:
        logger.error(f"Error listing recordings: {e}")
        raise HTTPException(status_code=500, detail="Failed to list recordings")


@router.get("/recordings/{recording_id}", response_model=RecordingDetailResponse)
async def get_recording_detail(
    recording_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get full recording detail including events."""
    try:
        row = await execute_one(
            """
            SELECT * FROM session_recordings
            WHERE id = :id AND user_id = :user_id
            """,
            {"id": recording_id, "user_id": user_id},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Recording not found")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching recording detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch recording")


@router.post("/recordings/{recording_id}/bookmarks", response_model=BookmarkResponse)
async def add_bookmark(
    recording_id: str,
    body: AddBookmarkRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Add a bookmark to a recording."""
    try:
        # Verify recording ownership
        rec = await execute_one(
            "SELECT id FROM session_recordings WHERE id = :id AND user_id = :user_id",
            {"id": recording_id, "user_id": user_id},
        )
        if not rec:
            raise HTTPException(status_code=404, detail="Recording not found")

        row = await execute_one(
            """
            INSERT INTO session_bookmarks (recording_id, user_id, event_index, label, note)
            VALUES (:recording_id, :user_id, :event_index, :label, :note)
            RETURNING *
            """,
            {
                "recording_id": recording_id,
                "user_id": user_id,
                "event_index": body.event_index,
                "label": body.label,
                "note": body.note,
            },
            commit=True,
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create bookmark")
        return serialize_row(row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to add bookmark")


@router.get("/recordings/{recording_id}/bookmarks", response_model=List[BookmarkResponse])
async def list_bookmarks(
    recording_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """List bookmarks for a recording."""
    try:
        # Verify recording ownership
        rec = await execute_one(
            "SELECT id FROM session_recordings WHERE id = :id AND user_id = :user_id",
            {"id": recording_id, "user_id": user_id},
        )
        if not rec:
            raise HTTPException(status_code=404, detail="Recording not found")

        rows = await execute(
            """
            SELECT * FROM session_bookmarks
            WHERE recording_id = :recording_id AND user_id = :user_id
            ORDER BY event_index ASC
            """,
            {"recording_id": recording_id, "user_id": user_id},
        )
        return serialize_rows(rows)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing bookmarks: {e}")
        raise HTTPException(status_code=500, detail="Failed to list bookmarks")
