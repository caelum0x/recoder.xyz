import base64
import hashlib
import html
import textwrap
from io import BytesIO
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ASPECT_RATIO_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "4:3": (1200, 900),
    "3:4": (900, 1200),
    "3:2": (1200, 800),
    "2:3": (800, 1200),
}

_FALLBACK_PALETTES: tuple[dict[str, tuple[int, int, int]], ...] = (
    {
        "background": (15, 23, 42),
        "panel": (30, 41, 59),
        "accent": (56, 189, 248),
        "accent_secondary": (14, 165, 233),
        "text": (248, 250, 252),
        "muted": (148, 163, 184),
    },
    {
        "background": (31, 41, 55),
        "panel": (55, 65, 81),
        "accent": (249, 115, 22),
        "accent_secondary": (251, 146, 60),
        "text": (255, 251, 235),
        "muted": (229, 231, 235),
    },
    {
        "background": (36, 13, 56),
        "panel": (59, 25, 89),
        "accent": (168, 85, 247),
        "accent_secondary": (192, 132, 252),
        "text": (250, 245, 255),
        "muted": (221, 214, 254),
    },
    {
        "background": (20, 83, 45),
        "panel": (21, 128, 61),
        "accent": (74, 222, 128),
        "accent_secondary": (134, 239, 172),
        "text": (240, 253, 244),
        "muted": (187, 247, 208),
    },
)

_PROVIDER_QUOTA_KEYWORDS: tuple[str, ...] = (
    "quota",
    "credit",
    "credits",
    "billing",
    "insufficient balance",
    "insufficient_balance",
    "out of credits",
    "payment required",
    "rate limit",
    "too many requests",
    "resource has been exhausted",
    "usage limit",
    "spending limit",
    "balance",
    "429",
    "402",
    "exhausted",
)


def get_fallback_dimensions(aspect_ratio: str | None) -> tuple[int, int]:
    return ASPECT_RATIO_DIMENSIONS.get(str(aspect_ratio or "1:1"), ASPECT_RATIO_DIMENSIONS["1:1"])


def is_provider_quota_error(error: Exception | str) -> bool:
    error_text = str(error).lower()
    return any(keyword in error_text for keyword in _PROVIDER_QUOTA_KEYWORDS)


def summarize_provider_errors(errors: Iterable[str], limit: int = 2) -> str:
    unique_errors: list[str] = []
    for error in errors:
        cleaned = " ".join(str(error).split())
        if cleaned and cleaned not in unique_errors:
            unique_errors.append(cleaned)

    if not unique_errors:
        return ""

    if len(unique_errors) <= limit:
        return " | ".join(unique_errors)

    remaining = len(unique_errors) - limit
    return f"{' | '.join(unique_errors[:limit])} | +{remaining} more"


def _palette_for_prompt(prompt: str) -> dict[str, tuple[int, int, int]]:
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    return _FALLBACK_PALETTES[int(digest[:8], 16) % len(_FALLBACK_PALETTES)]


def _rgb(color: tuple[int, int, int]) -> str:
    return f"rgb({color[0]}, {color[1]}, {color[2]})"


def _wrap_text(value: str, width: int, max_lines: int) -> list[str]:
    cleaned = " ".join(value.split()) or "Untitled request"
    lines = textwrap.wrap(cleaned, width=width) or [cleaned]
    return lines[:max_lines]


def build_fallback_svg_data_url(
    prompt: str,
    aspect_ratio: str = "1:1",
    title: str = "Fallback preview",
    reason: str = "Provider credits unavailable",
) -> str:
    width, height = get_fallback_dimensions(aspect_ratio)
    palette = _palette_for_prompt(prompt)
    portrait = height > width
    prompt_lines = _wrap_text(prompt, 28 if portrait else 44, 4)
    reason_lines = _wrap_text(reason, 32 if portrait else 52, 3)
    safe_prompt_lines = [html.escape(line) for line in prompt_lines]
    safe_reason_lines = [html.escape(line) for line in reason_lines]
    safe_title = html.escape(title)

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" rx="32" fill="{_rgb(palette["background"])}"/>',
        f'<rect x="{width * 0.06:.1f}" y="{height * 0.07:.1f}" width="{width * 0.88:.1f}" height="{height * 0.86:.1f}" rx="28" fill="{_rgb(palette["panel"])}"/>',
        f'<rect x="{width * 0.1:.1f}" y="{height * 0.12:.1f}" width="{width * 0.8:.1f}" height="{height * 0.035:.1f}" rx="14" fill="{_rgb(palette["accent"])}" opacity="0.95"/>',
        f'<rect x="{width * 0.1:.1f}" y="{height * 0.83:.1f}" width="{width * 0.42:.1f}" height="{height * 0.018:.1f}" rx="10" fill="{_rgb(palette["accent_secondary"])}" opacity="0.85"/>',
        f'<text x="{width * 0.1:.1f}" y="{height * 0.22:.1f}" fill="{_rgb(palette["text"])}" font-family="Inter, system-ui, sans-serif" font-size="{36 if portrait else 30}" font-weight="700">{safe_title}</text>',
    ]

    reason_start_y = height * 0.31
    for index, line in enumerate(safe_reason_lines):
        svg_lines.append(
            f'<text x="{width * 0.1:.1f}" y="{reason_start_y + index * (28 if portrait else 24):.1f}" fill="{_rgb(palette["muted"])}" font-family="Inter, system-ui, sans-serif" font-size="{22 if portrait else 20}" font-weight="500">{line}</text>'
        )

    svg_lines.append(
        f'<text x="{width * 0.1:.1f}" y="{height * 0.54:.1f}" fill="{_rgb(palette["text"])}" font-family="Inter, system-ui, sans-serif" font-size="{20 if portrait else 18}" font-weight="700">Prompt</text>'
    )

    prompt_start_y = height * 0.61
    for index, line in enumerate(safe_prompt_lines):
        svg_lines.append(
            f'<text x="{width * 0.1:.1f}" y="{prompt_start_y + index * (34 if portrait else 28):.1f}" fill="{_rgb(palette["text"])}" font-family="Inter, system-ui, sans-serif" font-size="{24 if portrait else 22}" font-weight="500">{line}</text>'
        )

    svg_lines.extend([
        f'<text x="{width * 0.1:.1f}" y="{height * 0.9:.1f}" fill="{_rgb(palette["muted"])}" font-family="Inter, system-ui, sans-serif" font-size="{18 if portrait else 16}">Retry after provider credits refresh or upload your own asset.</text>',
        '</svg>',
    ])

    svg_markup = "".join(svg_lines)
    encoded = base64.b64encode(svg_markup.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def build_fallback_image_bytes(
    prompt: str,
    media_type: str = "image",
    aspect_ratio: str = "1:1",
    reason: str = "Provider credits unavailable",
) -> bytes:
    width, height = get_fallback_dimensions(aspect_ratio)
    palette = _palette_for_prompt(prompt)
    portrait = height > width
    image = Image.new("RGB", (width, height), palette["background"])
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    margin = max(36, int(min(width, height) * 0.07))
    panel = (margin, margin, width - margin, height - margin)
    accent_height = max(18, int(height * 0.03))
    footer_height = max(10, int(height * 0.015))

    draw.rounded_rectangle(panel, radius=max(24, int(min(width, height) * 0.035)), fill=palette["panel"])
    draw.rounded_rectangle(
        (margin + 18, margin + 18, width - margin - 18, margin + 18 + accent_height),
        radius=max(10, accent_height // 2),
        fill=palette["accent"],
    )
    draw.rounded_rectangle(
        (margin + 18, height - margin - 18 - footer_height, width - margin - 18, height - margin - 18),
        radius=max(6, footer_height // 2),
        fill=palette["accent_secondary"],
    )

    title = f"{media_type.title()} fallback preview"
    reason_lines = _wrap_text(reason, 32 if portrait else 48, 3)
    prompt_lines = _wrap_text(prompt, 24 if portrait else 38, 5)

    title_y = margin + accent_height + 36
    draw.text((margin + 24, title_y), title, fill=palette["text"], font=font)

    reason_y = title_y + 34
    for line in reason_lines:
        draw.text((margin + 24, reason_y), line, fill=palette["muted"], font=font)
        reason_y += 22

    prompt_label_y = reason_y + 22
    draw.text((margin + 24, prompt_label_y), "Prompt", fill=palette["text"], font=font)

    prompt_y = prompt_label_y + 28
    for line in prompt_lines:
        draw.text((margin + 24, prompt_y), line, fill=palette["text"], font=font)
        prompt_y += 24

    footer = "Retry after provider credits refresh or upload your own asset."
    footer_lines = _wrap_text(footer, 34 if portrait else 54, 2)
    footer_y = height - margin - 56
    for line in footer_lines:
        draw.text((margin + 24, footer_y), line, fill=palette["muted"], font=font)
        footer_y += 20

    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
