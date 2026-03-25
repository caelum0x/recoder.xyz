"""
Thread Sentiment Tracker API endpoints.

Provides keyword-based sentiment scoring for thread messages,
trend analysis, and aggregate overview across all threads.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute, execute_one, execute_mutate
from core.utils.logger import logger

router = APIRouter(tags=["thread-sentiment"])


# ============================================================================
# Sentiment Analysis Constants
# ============================================================================

POSITIVE_WORDS = {
    "great", "thanks", "helpful", "excellent", "perfect",
    "good", "awesome", "love", "amazing", "wonderful",
}

NEGATIVE_WORDS = {
    "wrong", "error", "fail", "bad", "broken",
    "issue", "problem", "terrible", "awful", "frustrated",
}

SENTIMENT_VALUES = {
    "very_positive": 2,
    "positive": 1,
    "neutral": 0,
    "negative": -1,
    "very_negative": -2,
}


def _analyze_text(text: str) -> dict:
    """Analyze text for sentiment using keyword matching."""
    if not text:
        return {"sentiment": "neutral", "confidence": 0.5, "keywords": []}

    words = text.lower().split()
    found_positive = [w for w in words if w.strip(".,!?;:\"'()[]") in POSITIVE_WORDS]
    found_negative = [w for w in words if w.strip(".,!?;:\"'()[]") in NEGATIVE_WORDS]

    pos_count = len(found_positive)
    neg_count = len(found_negative)

    keywords = list(set(found_positive + found_negative))

    if pos_count == 0 and neg_count == 0:
        return {"sentiment": "neutral", "confidence": 0.5, "keywords": keywords}

    if pos_count > neg_count:
        sentiment = "very_positive" if pos_count >= 3 else "positive"
        confidence = min(0.95, 0.6 + pos_count * 0.1)
    elif neg_count > pos_count:
        sentiment = "very_negative" if neg_count >= 3 else "negative"
        confidence = min(0.95, 0.6 + neg_count * 0.1)
    else:
        sentiment = "neutral"
        confidence = 0.5

    return {"sentiment": sentiment, "confidence": round(confidence, 2), "keywords": keywords}


# ============================================================================
# Pydantic Models
# ============================================================================

class SentimentScore(BaseModel):
    id: Optional[str] = None
    thread_id: str
    message_index: int
    sentiment: str
    confidence: float = 0.8
    keywords: List[str] = []
    scored_at: Optional[str] = None


class SentimentTrendPoint(BaseModel):
    message_index: int
    sentiment: str
    value: int  # -2 to +2


class SentimentOverview(BaseModel):
    distribution: Dict[str, int] = {}
    most_positive_threads: List[Dict[str, Any]] = []
    most_negative_threads: List[Dict[str, Any]] = []
    per_agent_avg: List[Dict[str, Any]] = []


# ============================================================================
# Routes
# ============================================================================

@router.post(
    "/threads/{thread_id}/sentiment/analyze",
    summary="Analyze Thread Sentiment",
    operation_id="analyze_thread_sentiment",
)
async def analyze_thread_sentiment(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Analyze sentiment for all messages in a thread using keyword-based scoring."""
    # Fetch messages for this thread
    messages = await execute(
        """
        SELECT m.content, m.role, t.agent_id
        FROM messages m
        JOIN threads t ON t.thread_id::text = m.thread_id::text
        WHERE m.thread_id::text = :thread_id AND t.account_id::text = :user_id
        ORDER BY m.created_at ASC
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )

    if not messages:
        raise HTTPException(status_code=404, detail="No messages found for this thread")

    agent_id = messages[0].get("agent_id") if messages else None
    scores = []

    for idx, msg in enumerate(messages):
        content = msg.get("content") or ""
        # Only analyze user and assistant messages
        if msg.get("role") not in ("user", "assistant"):
            continue

        analysis = _analyze_text(content)

        # Upsert sentiment score
        await execute_mutate(
            """
            INSERT INTO thread_sentiment_scores (user_id, thread_id, agent_id, message_index, sentiment, confidence, keywords)
            VALUES (:user_id, :thread_id, :agent_id, :message_index, :sentiment, :confidence, :keywords)
            ON CONFLICT (thread_id, message_index) DO UPDATE
            SET sentiment = EXCLUDED.sentiment,
                confidence = EXCLUDED.confidence,
                keywords = EXCLUDED.keywords,
                scored_at = now()
            """,
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "agent_id": agent_id,
                "message_index": idx,
                "sentiment": analysis["sentiment"],
                "confidence": analysis["confidence"],
                "keywords": analysis["keywords"],
            },
        )

        scores.append({
            "message_index": idx,
            "sentiment": analysis["sentiment"],
            "confidence": analysis["confidence"],
            "keywords": analysis["keywords"],
        })

    return {
        "thread_id": thread_id,
        "scores_count": len(scores),
        "scores": scores,
    }


@router.get(
    "/threads/{thread_id}/sentiment",
    summary="Get Thread Sentiment Scores",
    operation_id="get_thread_sentiment",
    response_model=List[SentimentScore],
)
async def get_thread_sentiment(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get sentiment scores for all analyzed messages in a thread."""
    rows = await execute(
        """
        SELECT id, thread_id, message_index, sentiment, confidence, keywords, scored_at
        FROM thread_sentiment_scores
        WHERE thread_id::text = :thread_id AND user_id::text = :user_id
        ORDER BY message_index ASC
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )

    return [
        SentimentScore(
            id=str(row["id"]),
            thread_id=row["thread_id"],
            message_index=row["message_index"],
            sentiment=row["sentiment"],
            confidence=float(row["confidence"]),
            keywords=row.get("keywords") or [],
            scored_at=row["scored_at"].isoformat() if hasattr(row.get("scored_at"), "isoformat") else str(row.get("scored_at")),
        )
        for row in rows
    ]


@router.get(
    "/threads/{thread_id}/sentiment/trend",
    summary="Get Sentiment Trend",
    operation_id="get_sentiment_trend",
    response_model=List[SentimentTrendPoint],
)
async def get_sentiment_trend(
    thread_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get sentiment trend for a thread as numeric values for charting."""
    rows = await execute(
        """
        SELECT message_index, sentiment
        FROM thread_sentiment_scores
        WHERE thread_id::text = :thread_id AND user_id::text = :user_id
        ORDER BY message_index ASC
        """,
        {"thread_id": thread_id, "user_id": user_id},
    )

    return [
        SentimentTrendPoint(
            message_index=row["message_index"],
            sentiment=row["sentiment"],
            value=SENTIMENT_VALUES.get(row["sentiment"], 0),
        )
        for row in rows
    ]


@router.get(
    "/sentiment/overview",
    summary="Get Sentiment Overview",
    operation_id="get_sentiment_overview",
    response_model=SentimentOverview,
)
async def get_sentiment_overview(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Get aggregate sentiment overview across all threads for the authenticated user."""
    # Distribution counts
    dist_rows = await execute(
        """
        SELECT sentiment, COUNT(*) AS cnt
        FROM thread_sentiment_scores
        WHERE user_id::text = :user_id
        GROUP BY sentiment
        """,
        {"user_id": user_id},
    )
    distribution = {row["sentiment"]: row["cnt"] for row in dist_rows}

    # Most positive threads (top 5 by average sentiment value)
    positive_rows = await execute(
        """
        SELECT thread_id,
               AVG(CASE sentiment
                   WHEN 'very_positive' THEN 2
                   WHEN 'positive' THEN 1
                   WHEN 'neutral' THEN 0
                   WHEN 'negative' THEN -1
                   WHEN 'very_negative' THEN -2
               END) AS avg_sentiment,
               COUNT(*) AS message_count
        FROM thread_sentiment_scores
        WHERE user_id::text = :user_id
        GROUP BY thread_id
        ORDER BY avg_sentiment DESC
        LIMIT 5
        """,
        {"user_id": user_id},
    )
    most_positive = [
        {
            "thread_id": row["thread_id"],
            "avg_sentiment": round(float(row["avg_sentiment"]), 2),
            "message_count": row["message_count"],
        }
        for row in positive_rows
    ]

    # Most negative threads (top 5)
    negative_rows = await execute(
        """
        SELECT thread_id,
               AVG(CASE sentiment
                   WHEN 'very_positive' THEN 2
                   WHEN 'positive' THEN 1
                   WHEN 'neutral' THEN 0
                   WHEN 'negative' THEN -1
                   WHEN 'very_negative' THEN -2
               END) AS avg_sentiment,
               COUNT(*) AS message_count
        FROM thread_sentiment_scores
        WHERE user_id::text = :user_id
        GROUP BY thread_id
        ORDER BY avg_sentiment ASC
        LIMIT 5
        """,
        {"user_id": user_id},
    )
    most_negative = [
        {
            "thread_id": row["thread_id"],
            "avg_sentiment": round(float(row["avg_sentiment"]), 2),
            "message_count": row["message_count"],
        }
        for row in negative_rows
    ]

    # Per-agent average sentiment
    agent_rows = await execute(
        """
        SELECT agent_id,
               AVG(CASE sentiment
                   WHEN 'very_positive' THEN 2
                   WHEN 'positive' THEN 1
                   WHEN 'neutral' THEN 0
                   WHEN 'negative' THEN -1
                   WHEN 'very_negative' THEN -2
               END) AS avg_sentiment,
               COUNT(*) AS message_count
        FROM thread_sentiment_scores
        WHERE user_id::text = :user_id AND agent_id IS NOT NULL
        GROUP BY agent_id
        ORDER BY avg_sentiment DESC
        """,
        {"user_id": user_id},
    )
    per_agent = [
        {
            "agent_id": row["agent_id"],
            "avg_sentiment": round(float(row["avg_sentiment"]), 2),
            "message_count": row["message_count"],
        }
        for row in agent_rows
    ]

    return SentimentOverview(
        distribution=distribution,
        most_positive_threads=most_positive,
        most_negative_threads=most_negative,
        per_agent_avg=per_agent,
    )
