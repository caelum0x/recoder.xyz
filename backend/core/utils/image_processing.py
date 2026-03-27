"""
Shared Image Processing Utilities

Provides common image processing operations (upscale, remove background)
that can be used by both agent tools and API endpoints.

Primary path uses OpenRouter (Gemini) for all operations.
Replicate is used as a fallback when REPLICATE_API_TOKEN is configured.

Models used:
- Upscale: OpenRouter Gemini (primary) or recraft-ai/recraft-crisp-upscale (Replicate fallback)
- Remove BG: OpenRouter Gemini (primary) or 851-labs/background-remover (Replicate fallback)
"""

import os
import base64
import httpx
from typing import Tuple, Optional
from core.utils.logger import logger
from core.utils.config import get_config


# OpenRouter config
OPENROUTER_IMAGE_MODEL = "google/gemini-2.5-flash-preview-05-20"


def _has_replicate_token() -> bool:
    """Check if Replicate API token is available (without raising)."""
    config = get_config()
    return bool(config.REPLICATE_API_TOKEN)


def get_replicate_token() -> str:
    """Get and set Replicate API token from config.
    Raises if REPLICATE_API_TOKEN is not set."""
    config = get_config()
    token = config.REPLICATE_API_TOKEN
    if not token:
        raise Exception("Replicate API token not configured. Upscale/remove-bg require REPLICATE_API_TOKEN in .env")
    os.environ["REPLICATE_API_TOKEN"] = token
    return token


def replicate_output_to_bytes(output, output_format: str = "png") -> Tuple[bytes, str]:
    """
    Convert Replicate FileOutput to bytes and mime type.

    Args:
        output: Replicate output (FileOutput or URL)
        output_format: Expected output format (png, webp, etc.)

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    import urllib.request

    # FileOutput has .read() method for sync reading
    if hasattr(output, 'read'):
        result_bytes = output.read()
        mime = f"image/{output_format}"
        return result_bytes, mime

    # Fallback: fetch from URL if it's a URL string
    url = str(output.url) if hasattr(output, 'url') else str(output)
    with urllib.request.urlopen(url) as response:
        result_bytes = response.read()
        mime = f"image/{output_format}"
        return result_bytes, mime


def _openrouter_image_edit_sync(image_bytes: bytes, mime_type: str, prompt: str) -> Optional[Tuple[bytes, str]]:
    """
    Process an image via OpenRouter Gemini (synchronous).
    Sends the image + prompt and expects an image back.

    Returns:
        Tuple of (result_bytes, result_mime) on success, or None on failure.
    """
    config = get_config()
    api_key = config.OPENROUTER_API_KEY or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("No OPENROUTER_API_KEY configured for image processing")
        return None

    try:
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        user_content = [
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
            },
            {"type": "text", "text": prompt},
        ]

        with httpx.Client(timeout=120) as client:
            response = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://recoder.xyz",
                    "X-Title": "Recoder Image Processing",
                },
                json={
                    "model": OPENROUTER_IMAGE_MODEL,
                    "messages": [{"role": "user", "content": user_content}],
                    "modalities": ["image", "text"],
                },
            )
            if response.status_code != 200:
                body = response.text[:500]
                logger.warning(f"OpenRouter image processing failed: {response.status_code} — {body}")
                return None

            data = response.json()
            message = data.get("choices", [{}])[0].get("message", {})
            content = message.get("content")

            # Extract image from response
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "image_url":
                        url = part.get("image_url", {}).get("url")
                        if url and url.startswith("data:"):
                            b64_data = url.split(",", 1)[1]
                            result_bytes = base64.b64decode(b64_data)
                            return result_bytes, "image/png"

            # Fallback: check legacy .images field
            images = message.get("images", [])
            if images:
                url = images[0].get("image_url", {}).get("url") if isinstance(images[0], dict) else None
                if url and url.startswith("data:"):
                    b64_data = url.split(",", 1)[1]
                    result_bytes = base64.b64decode(b64_data)
                    return result_bytes, "image/png"

            logger.warning("OpenRouter image processing: no image found in response")
            return None
    except Exception as e:
        logger.warning(f"OpenRouter image processing error: {e}")
        return None


def upscale_image_sync(image_bytes: bytes, mime_type: str = "image/png") -> Tuple[bytes, str]:
    """
    Upscale image. Uses Replicate if configured, otherwise falls back to OpenRouter Gemini.

    This is a synchronous function that blocks until completion.
    Use for agent tools where we want to wait for result.

    Args:
        image_bytes: Raw image bytes
        mime_type: MIME type of input image

    Returns:
        Tuple of (upscaled_image_bytes, output_mime_type)

    Raises:
        Exception: If upscale fails via all providers
    """
    # Try Replicate first if token is available
    if _has_replicate_token():
        try:
            import replicate
            get_replicate_token()

            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            image_data_url = f"data:{mime_type};base64,{image_b64}"

            logger.info("Calling Replicate recraft-ai/recraft-crisp-upscale")

            output = replicate.run(
                "recraft-ai/recraft-crisp-upscale",
                input={"image": image_data_url}
            )
            result_bytes, result_mime = replicate_output_to_bytes(output, "webp")
            logger.info(f"Upscale complete via Replicate: {len(result_bytes)} bytes")
            return result_bytes, result_mime
        except Exception as e:
            logger.warning(f"Replicate upscale failed, trying OpenRouter: {e}")

    # Fallback: OpenRouter Gemini
    logger.info("Using OpenRouter Gemini for image upscale")
    upscale_prompt = (
        "Upscale this image to higher resolution. Enhance details, improve clarity, "
        "and increase quality while maintaining the original content and style exactly. "
        "Make it sharper and more detailed. Output the enhanced image."
    )
    result = _openrouter_image_edit_sync(image_bytes, mime_type, upscale_prompt)
    if result:
        result_bytes, result_mime = result
        logger.info(f"Upscale complete via OpenRouter: {len(result_bytes)} bytes")
        return result_bytes, result_mime

    raise Exception("Upscale failed: neither Replicate nor OpenRouter could process the image. Check OPENROUTER_API_KEY in backend/.env.")


def remove_background_sync(image_bytes: bytes, mime_type: str = "image/png") -> Tuple[bytes, str]:
    """
    Remove background from image. Uses Replicate if configured, otherwise falls back to OpenRouter Gemini.

    This is a synchronous function that blocks until completion.
    Use for agent tools where we want to wait for result.

    Args:
        image_bytes: Raw image bytes
        mime_type: MIME type of input image

    Returns:
        Tuple of (result_image_bytes, output_mime_type) - PNG with transparency

    Raises:
        Exception: If background removal fails via all providers
    """
    # Try Replicate first if token is available
    if _has_replicate_token():
        try:
            import replicate
            get_replicate_token()

            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            image_data_url = f"data:{mime_type};base64,{image_b64}"

            logger.info("Calling Replicate 851-labs/background-remover")

            output = replicate.run(
                "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
                input={"image": image_data_url}
            )
            result_bytes, result_mime = replicate_output_to_bytes(output, "png")
            logger.info(f"Remove BG complete via Replicate: {len(result_bytes)} bytes")
            return result_bytes, result_mime
        except Exception as e:
            logger.warning(f"Replicate remove_bg failed, trying OpenRouter: {e}")

    # Fallback: OpenRouter Gemini
    logger.info("Using OpenRouter Gemini for background removal")
    remove_bg_prompt = (
        "Remove the background from this image completely. Keep only the main subject/object "
        "with clean edges. The background should be transparent (output as PNG with alpha channel). "
        "Preserve all details of the subject. Output the result as a PNG image with transparent background."
    )
    result = _openrouter_image_edit_sync(image_bytes, mime_type, remove_bg_prompt)
    if result:
        result_bytes, result_mime = result
        logger.info(f"Remove BG complete via OpenRouter: {len(result_bytes)} bytes")
        return result_bytes, "image/png"

    raise Exception("Background removal failed: neither Replicate nor OpenRouter could process the image. Check OPENROUTER_API_KEY in backend/.env.")


# Model identifiers for billing
UPSCALE_MODEL = "recraft-ai/recraft-crisp-upscale"
REMOVE_BG_MODEL = "851-labs/background-remover"

