"""
Cost estimation for agent runs based on prompt size and model pricing.

Provides per-model token pricing and a helper to predict the cost
of an agent run given an input token count and an expected output multiplier.
"""

MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4": {"input_per_1k": 0.003, "output_per_1k": 0.015},
    "claude-opus-4": {"input_per_1k": 0.015, "output_per_1k": 0.075},
    "gpt-5.1": {"input_per_1k": 0.005, "output_per_1k": 0.015},
    "gpt-5.2": {"input_per_1k": 0.0025, "output_per_1k": 0.010},
    "gemini-2.5-flash": {"input_per_1k": 0.00015, "output_per_1k": 0.0006},
    "gemini-2.0-flash": {"input_per_1k": 0.0001, "output_per_1k": 0.0004},
    "deepseek-v3": {"input_per_1k": 0.00014, "output_per_1k": 0.00028},
    "qwen3-coder": {"input_per_1k": 0.0002, "output_per_1k": 0.0006},
}


def estimate_cost(
    model: str,
    input_tokens: int,
    output_multiplier: float = 1.5,
) -> dict:
    """Estimate the USD cost of an agent run.

    Args:
        model: Model identifier (must match a key in MODEL_PRICING for a priced estimate).
        input_tokens: Expected number of input tokens.
        output_multiplier: Ratio of estimated output tokens to input tokens (default 1.5).

    Returns:
        A dict with token estimates, cost, and whether pricing data was available.
    """
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return {
            "model": model,
            "estimated_input_tokens": input_tokens,
            "estimated_output_tokens": int(input_tokens * output_multiplier),
            "estimated_cost_usd": 0.0,
            "pricing_available": False,
        }

    est_output = int(input_tokens * output_multiplier)
    cost = (input_tokens / 1000 * pricing["input_per_1k"]) + (
        est_output / 1000 * pricing["output_per_1k"]
    )

    return {
        "model": model,
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": est_output,
        "estimated_cost_usd": round(cost, 6),
        "pricing_available": True,
    }
