import pytest
from core.ai.cost_estimator import estimate_cost, MODEL_PRICING


def test_estimate_cost_known_model():
    result = estimate_cost(model="claude-sonnet-4", input_tokens=1000, output_multiplier=2.0)
    assert result["model"] == "claude-sonnet-4"
    assert result["estimated_input_tokens"] == 1000
    assert result["estimated_output_tokens"] == 2000
    assert result["estimated_cost_usd"] > 0
    assert isinstance(result["estimated_cost_usd"], float)


def test_estimate_cost_unknown_model():
    result = estimate_cost(model="unknown", input_tokens=500)
    assert result["estimated_cost_usd"] == 0.0
    assert result["pricing_available"] is False


def test_model_pricing_has_entries():
    assert len(MODEL_PRICING) > 0
    assert "claude-sonnet-4" in MODEL_PRICING
