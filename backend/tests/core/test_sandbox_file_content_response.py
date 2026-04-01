from core.sandbox.file_content_response import build_file_content_response


def test_build_file_content_response_for_head_keeps_headers_without_body():
    content = b'{"slides": 5}'

    response = build_file_content_response(
        "/home/daytona/presentations/nike/metadata.json",
        content,
        include_body=False,
    )

    assert response.media_type == "application/json"
    assert response.body == b""
    assert response.headers["content-length"] == str(len(content))
    assert response.headers["cache-control"] == "no-cache"


def test_build_file_content_response_for_download_sets_attachment_headers():
    content = b"%PDF-1.7"

    response = build_file_content_response(
        "/home/daytona/exports/report.pdf",
        content,
        include_body=True,
    )

    assert response.media_type == "application/pdf"
    assert response.body == content
    assert response.headers["content-length"] == str(len(content))
    assert "attachment; filename*=UTF-8''report.pdf" in response.headers["content-disposition"]
