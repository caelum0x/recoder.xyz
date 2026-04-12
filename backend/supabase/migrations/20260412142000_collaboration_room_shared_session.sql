ALTER TABLE collaboration_rooms
ADD COLUMN IF NOT EXISTS shared_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_collaboration_rooms_shared_session_id
ON collaboration_rooms(shared_session_id)
WHERE shared_session_id IS NOT NULL;
