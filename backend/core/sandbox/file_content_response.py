import os
import urllib.parse
import mimetypes

from fastapi.responses import Response


def build_file_content_response(path: str, content: bytes, *, include_body: bool) -> Response:
    """Build a consistent GET/HEAD response for sandbox file content."""
    filename = os.path.basename(path)
    encoded_filename = urllib.parse.quote(filename, safe='')

    mime_type, _ = mimetypes.guess_type(path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    renderable = mime_type.startswith(('text/', 'application/json', 'application/javascript', 'image/'))
    headers = {
        "Content-Length": str(len(content)),
    }
    if renderable:
        headers["Cache-Control"] = "no-cache"
    else:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{encoded_filename}"

    return Response(
        content=content if include_body else b"",
        media_type=mime_type,
        headers=headers,
    )
