"""
Usage Forecasting API endpoints.

Provides forecast generation via linear regression on historical usage snapshots,
trend analysis, and projected overage detection.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.services.db import execute, execute_one, execute_mutate
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger

router = APIRouter(prefix="/usage", tags=["usage-forecasting"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ForecastDataPoint(BaseModel):
    period: str
    value: float
    is_projected: bool = False


class UsageForecast(BaseModel):
    id: str
    user_id: str
    metric_type: str
    forecast_period: str
    historical_data: List[Dict[str, Any]] = []
    forecast_data: List[Dict[str, Any]] = []
    trend: str = "stable"
    confidence_score: float = 0.0
    alert_threshold: Optional[float] = None
    projected_value: Optional[float] = None
    generated_at: str


class GenerateForecastRequest(BaseModel):
    metric_type: str = Field(..., description="tokens, api_calls, cost, storage, compute_minutes, or thread_count")
    forecast_period: str = Field(default="monthly", description="daily, weekly, or monthly")
    alert_threshold: Optional[float] = Field(default=None, description="Optional threshold for overage alerts")


class GenerateForecastResponse(BaseModel):
    forecast: UsageForecast
    message: str = "Forecast generated successfully"


class RecordSnapshotRequest(BaseModel):
    metric_type: str
    value: float
    period_start: str = Field(..., description="ISO datetime string")
    period_end: str = Field(..., description="ISO datetime string")
    metadata: Dict[str, Any] = {}


class UsageSnapshot(BaseModel):
    id: str
    user_id: str
    metric_type: str
    value: float
    period_start: str
    period_end: str
    metadata: Dict[str, Any] = {}
    recorded_at: str


class TrendSummary(BaseModel):
    metric_type: str
    trend: str
    current_value: float
    projected_value: Optional[float] = None
    change_percent: Optional[float] = None


class UsageTrendsResponse(BaseModel):
    trends: List[TrendSummary] = []
    highest_growth_metric: Optional[str] = None
    projected_overages: List[Dict[str, Any]] = []


# ============================================================================
# Helpers
# ============================================================================

VALID_METRICS = {'tokens', 'api_calls', 'cost', 'storage', 'compute_minutes', 'thread_count'}
VALID_PERIODS = {'daily', 'weekly', 'monthly'}


def _linear_regression(values: List[float]) -> tuple:
    """Simple linear regression returning (slope, intercept)."""
    n = len(values)
    if n < 2:
        return (0.0, values[0] if values else 0.0)

    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n

    numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    denominator = sum((i - x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return (0.0, y_mean)

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return (slope, intercept)


def _determine_trend(values: List[float]) -> str:
    """Determine trend from a list of values."""
    if len(values) < 3:
        return "stable"

    slope, _ = _linear_regression(values)

    # Check for volatility
    mean = sum(values) / len(values) if values else 0
    if mean > 0:
        std_dev = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
        cv = std_dev / mean  # coefficient of variation
        if cv > 0.5:
            return "volatile"

    threshold = mean * 0.05 if mean > 0 else 0.01
    if slope > threshold:
        return "increasing"
    elif slope < -threshold:
        return "decreasing"
    return "stable"


def _compute_confidence(n_points: int, r_squared: float = 0.0) -> float:
    """Compute confidence score from data points and fit quality."""
    if n_points < 3:
        return 0.1
    base = min(n_points / 30.0, 1.0)  # More data = more confidence
    return round(min(base * 0.7 + r_squared * 0.3, 0.99), 2)


def _r_squared(values: List[float], slope: float, intercept: float) -> float:
    """Compute R-squared for the linear fit."""
    if len(values) < 2:
        return 0.0
    y_mean = sum(values) / len(values)
    ss_tot = sum((v - y_mean) ** 2 for v in values)
    if ss_tot == 0:
        return 1.0
    ss_res = sum((v - (slope * i + intercept)) ** 2 for i, v in enumerate(values))
    return max(0.0, 1.0 - ss_res / ss_tot)


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/forecast/generate", response_model=GenerateForecastResponse, summary="Generate usage forecast")
async def generate_forecast(body: GenerateForecastRequest, request: Request):
    """
    Generate a usage forecast using linear regression on historical snapshots.
    Stores the forecast and returns it.
    """
    user_id = verify_and_get_user_id_from_jwt(request)

    if body.metric_type not in VALID_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid metric_type. Must be one of: {', '.join(VALID_METRICS)}")
    if body.forecast_period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"Invalid forecast_period. Must be one of: {', '.join(VALID_PERIODS)}")

    try:
        # Fetch historical snapshots
        lookback_days = {"daily": 90, "weekly": 180, "monthly": 365}.get(body.forecast_period, 90)
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        sql = """
        SELECT value, period_start, period_end, metadata
        FROM usage_snapshots
        WHERE user_id::text = :user_id
          AND metric_type = :metric_type
          AND recorded_at >= :cutoff
        ORDER BY period_start ASC
        """
        rows = await execute(sql, {
            "user_id": user_id,
            "metric_type": body.metric_type,
            "cutoff": cutoff,
        })

        historical_data = []
        values = []
        for row in (rows or []):
            val = float(row["value"])
            values.append(val)
            historical_data.append({
                "period": str(row["period_start"]),
                "value": val,
                "is_projected": False,
            })

        # Linear regression
        slope, intercept = _linear_regression(values)
        r_sq = _r_squared(values, slope, intercept)
        trend = _determine_trend(values)
        confidence = _compute_confidence(len(values), r_sq)

        # Generate forecast points
        n_forecast = {"daily": 30, "weekly": 12, "monthly": 6}.get(body.forecast_period, 6)
        forecast_data = []
        n = len(values)
        last_projected = 0.0

        for i in range(n_forecast):
            projected = max(0.0, slope * (n + i) + intercept)
            last_projected = projected
            forecast_data.append({
                "period": f"forecast_{i + 1}",
                "value": round(projected, 2),
                "is_projected": True,
            })

        # Store forecast
        insert_sql = """
        INSERT INTO usage_forecasts (
            user_id, metric_type, forecast_period,
            historical_data, forecast_data, trend,
            confidence_score, alert_threshold, projected_value
        ) VALUES (
            :user_id, :metric_type, :forecast_period,
            :historical_data, :forecast_data, :trend,
            :confidence_score, :alert_threshold, :projected_value
        )
        RETURNING id, generated_at
        """
        result = await execute_one(insert_sql, {
            "user_id": user_id,
            "metric_type": body.metric_type,
            "forecast_period": body.forecast_period,
            "historical_data": json.dumps(historical_data),
            "forecast_data": json.dumps(forecast_data),
            "trend": trend,
            "confidence_score": confidence,
            "alert_threshold": body.alert_threshold,
            "projected_value": round(last_projected, 2),
        })

        forecast = UsageForecast(
            id=str(result["id"]),
            user_id=str(user_id),
            metric_type=body.metric_type,
            forecast_period=body.forecast_period,
            historical_data=historical_data,
            forecast_data=forecast_data,
            trend=trend,
            confidence_score=confidence,
            alert_threshold=body.alert_threshold,
            projected_value=round(last_projected, 2),
            generated_at=str(result["generated_at"]),
        )

        return GenerateForecastResponse(forecast=forecast)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating forecast for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate forecast")


@router.get("/forecasts", response_model=List[UsageForecast], summary="List usage forecasts")
async def list_forecasts(
    request: Request,
    metric_type: Optional[str] = Query(None, description="Filter by metric type"),
    forecast_period: Optional[str] = Query(None, description="Filter by period"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List forecasts for the current user with optional filters."""
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if metric_type:
            where_clauses.append("metric_type = :metric_type")
            params["metric_type"] = metric_type
        if forecast_period:
            where_clauses.append("forecast_period = :forecast_period")
            params["forecast_period"] = forecast_period

        where_sql = " AND ".join(where_clauses)

        sql = f"""
        SELECT id, user_id, metric_type, forecast_period,
               historical_data, forecast_data, trend,
               confidence_score, alert_threshold, projected_value, generated_at
        FROM usage_forecasts
        WHERE {where_sql}
        ORDER BY generated_at DESC
        LIMIT :limit OFFSET :offset
        """

        rows = await execute(sql, params)

        return [
            UsageForecast(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                metric_type=row["metric_type"],
                forecast_period=row["forecast_period"],
                historical_data=row["historical_data"] or [],
                forecast_data=row["forecast_data"] or [],
                trend=row["trend"],
                confidence_score=float(row["confidence_score"]),
                alert_threshold=float(row["alert_threshold"]) if row["alert_threshold"] else None,
                projected_value=float(row["projected_value"]) if row["projected_value"] else None,
                generated_at=str(row["generated_at"]),
            )
            for row in (rows or [])
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing forecasts for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list forecasts")


@router.get("/forecasts/{metric_type}", response_model=UsageForecast, summary="Get detailed forecast by metric")
async def get_forecast_detail(
    metric_type: str,
    request: Request,
    forecast_period: str = Query("monthly", description="daily, weekly, or monthly"),
):
    """Get the latest forecast for a specific metric type with historical and projected data."""
    user_id = verify_and_get_user_id_from_jwt(request)

    if metric_type not in VALID_METRICS:
        raise HTTPException(status_code=400, detail=f"Invalid metric_type. Must be one of: {', '.join(VALID_METRICS)}")

    try:
        sql = """
        SELECT id, user_id, metric_type, forecast_period,
               historical_data, forecast_data, trend,
               confidence_score, alert_threshold, projected_value, generated_at
        FROM usage_forecasts
        WHERE user_id::text = :user_id
          AND metric_type = :metric_type
          AND forecast_period = :forecast_period
        ORDER BY generated_at DESC
        LIMIT 1
        """
        row = await execute_one(sql, {
            "user_id": user_id,
            "metric_type": metric_type,
            "forecast_period": forecast_period,
        })

        if not row:
            raise HTTPException(status_code=404, detail=f"No forecast found for metric '{metric_type}'")

        return UsageForecast(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            metric_type=row["metric_type"],
            forecast_period=row["forecast_period"],
            historical_data=row["historical_data"] or [],
            forecast_data=row["forecast_data"] or [],
            trend=row["trend"],
            confidence_score=float(row["confidence_score"]),
            alert_threshold=float(row["alert_threshold"]) if row["alert_threshold"] else None,
            projected_value=float(row["projected_value"]) if row["projected_value"] else None,
            generated_at=str(row["generated_at"]),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching forecast detail for user {user_id}, metric {metric_type}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch forecast detail")


@router.post("/snapshots", response_model=UsageSnapshot, summary="Record usage snapshot")
async def record_snapshot(body: RecordSnapshotRequest, request: Request):
    """Record a usage snapshot for a given metric and period."""
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        sql = """
        INSERT INTO usage_snapshots (user_id, metric_type, value, period_start, period_end, metadata)
        VALUES (:user_id, :metric_type, :value, :period_start, :period_end, :metadata)
        RETURNING id, recorded_at
        """
        result = await execute_one(sql, {
            "user_id": user_id,
            "metric_type": body.metric_type,
            "value": body.value,
            "period_start": body.period_start,
            "period_end": body.period_end,
            "metadata": json.dumps(body.metadata),
        })

        return UsageSnapshot(
            id=str(result["id"]),
            user_id=str(user_id),
            metric_type=body.metric_type,
            value=body.value,
            period_start=body.period_start,
            period_end=body.period_end,
            metadata=body.metadata,
            recorded_at=str(result["recorded_at"]),
        )

    except Exception as e:
        logger.error(f"Error recording snapshot for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record snapshot")


@router.get("/snapshots", response_model=List[UsageSnapshot], summary="List usage snapshots")
async def list_snapshots(
    request: Request,
    metric_type: Optional[str] = Query(None, description="Filter by metric type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List usage snapshots for the current user."""
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        where_clauses = ["user_id::text = :user_id"]
        params: Dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if metric_type:
            where_clauses.append("metric_type = :metric_type")
            params["metric_type"] = metric_type

        where_sql = " AND ".join(where_clauses)

        sql = f"""
        SELECT id, user_id, metric_type, value, period_start, period_end, metadata, recorded_at
        FROM usage_snapshots
        WHERE {where_sql}
        ORDER BY recorded_at DESC
        LIMIT :limit OFFSET :offset
        """

        rows = await execute(sql, params)

        return [
            UsageSnapshot(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                metric_type=row["metric_type"],
                value=float(row["value"]),
                period_start=str(row["period_start"]),
                period_end=str(row["period_end"]),
                metadata=row["metadata"] or {},
                recorded_at=str(row["recorded_at"]),
            )
            for row in (rows or [])
        ]

    except Exception as e:
        logger.error(f"Error listing snapshots for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list snapshots")


@router.get("/trends", response_model=UsageTrendsResponse, summary="Get usage trends summary")
async def get_usage_trends(request: Request):
    """
    Summary of usage trends across all metrics.
    Returns trend per metric, highest growth metric, and projected overages.
    """
    user_id = verify_and_get_user_id_from_jwt(request)

    try:
        trends: List[TrendSummary] = []
        highest_growth_metric: Optional[str] = None
        highest_growth_pct: float = -999.0
        projected_overages: List[Dict[str, Any]] = []

        for metric in VALID_METRICS:
            # Get latest forecast
            forecast_sql = """
            SELECT trend, projected_value, alert_threshold, confidence_score
            FROM usage_forecasts
            WHERE user_id::text = :user_id AND metric_type = :metric_type
            ORDER BY generated_at DESC
            LIMIT 1
            """
            forecast_row = await execute_one(forecast_sql, {
                "user_id": user_id,
                "metric_type": metric,
            })

            # Get latest snapshot value
            snapshot_sql = """
            SELECT value
            FROM usage_snapshots
            WHERE user_id::text = :user_id AND metric_type = :metric_type
            ORDER BY recorded_at DESC
            LIMIT 1
            """
            snapshot_row = await execute_one(snapshot_sql, {
                "user_id": user_id,
                "metric_type": metric,
            })

            current_value = float(snapshot_row["value"]) if snapshot_row else 0.0
            trend_str = forecast_row["trend"] if forecast_row else "stable"
            projected = float(forecast_row["projected_value"]) if forecast_row and forecast_row["projected_value"] else None
            threshold = float(forecast_row["alert_threshold"]) if forecast_row and forecast_row["alert_threshold"] else None

            change_pct = None
            if current_value > 0 and projected is not None:
                change_pct = round(((projected - current_value) / current_value) * 100, 2)
                if change_pct > highest_growth_pct:
                    highest_growth_pct = change_pct
                    highest_growth_metric = metric

            trends.append(TrendSummary(
                metric_type=metric,
                trend=trend_str,
                current_value=current_value,
                projected_value=projected,
                change_percent=change_pct,
            ))

            # Check for projected overage
            if threshold is not None and projected is not None and projected > threshold:
                projected_overages.append({
                    "metric_type": metric,
                    "threshold": threshold,
                    "projected_value": projected,
                    "overage_amount": round(projected - threshold, 2),
                    "overage_percent": round(((projected - threshold) / threshold) * 100, 2) if threshold > 0 else 0,
                })

        return UsageTrendsResponse(
            trends=trends,
            highest_growth_metric=highest_growth_metric,
            projected_overages=projected_overages,
        )

    except Exception as e:
        logger.error(f"Error fetching usage trends for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage trends")
