import base64

from core.utils.media_fallbacks import (
    build_fallback_image_bytes,
    build_fallback_svg_data_url,
    is_provider_quota_error,
    summarize_provider_errors,
)


def test_is_provider_quota_error_detects_credit_and_rate_limit_signals() -> None:
    assert is_provider_quota_error("Replicate credits exhausted for this account")
    assert is_provider_quota_error("fal.ai video failed (402): payment required")
    assert is_provider_quota_error("OpenRouter returned 429 Too Many Requests")
    assert not is_provider_quota_error("Prompt rejected by content safety filter")


def test_build_fallback_svg_data_url_returns_svg_data_url() -> None:
    data_url = build_fallback_svg_data_url(
        prompt="Build a cinematic hero frame for a coffee brand",
        aspect_ratio="16:9",
        reason="Provider credits are unavailable right now",
    )

    assert data_url.startswith("data:image/svg+xml;base64,")

    encoded = data_url.split(",", 1)[1]
    decoded = base64.b64decode(encoded).decode("utf-8")
    assert "<svg" in decoded
    assert "Build a cinematic hero frame" in decoded
    assert "Provider credits are unavailable right now" in decoded


def test_build_fallback_image_bytes_returns_png_payload() -> None:
    image_bytes = build_fallback_image_bytes(
        prompt="Create a launch poster for a robotics startup",
        media_type="video",
        aspect_ratio="9:16",
        reason="Video providers are temporarily out of credits",
    )

    assert image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(image_bytes) > 1024


def test_summarize_provider_errors_deduplicates_and_limits() -> None:
    summary = summarize_provider_errors(
        [
            "Replicate: 402 payment required",
            "OpenRouter: 429 too many requests",
            "Replicate: 402 payment required",
            "fal.ai: provider balance exhausted",
        ],
        limit=2,
    )

    assert summary == "Replicate: 402 payment required | OpenRouter: 429 too many requests | +1 more"
