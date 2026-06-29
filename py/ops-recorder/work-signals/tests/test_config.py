from __future__ import annotations

from fastapi import HTTPException

from config import (
    configured_github_repo,
    configured_linear_team_id,
    require_api_key,
)


def test_require_api_key_rejects_missing_config(monkeypatch) -> None:
    monkeypatch.delenv("OPS_RECORDER_API_KEY", raising=False)
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    try:
        require_api_key(None)
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("missing OPS_RECORDER_API_KEY should fail closed")


def test_require_api_key_rejects_bad_key(monkeypatch) -> None:
    monkeypatch.setenv("OPS_RECORDER_API_KEY", "expected-key")
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    try:
        require_api_key("wrong-key")
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("bad API key should be rejected")


def test_require_api_key_accepts_matching_key(monkeypatch) -> None:
    monkeypatch.setenv("OPS_RECORDER_API_KEY", "expected-key")
    monkeypatch.delenv("OPS_RECORDER_AUTH_DISABLED", raising=False)

    assert require_api_key("expected-key") is None


def test_require_api_key_can_be_disabled_for_local_dev(monkeypatch) -> None:
    monkeypatch.delenv("OPS_RECORDER_API_KEY", raising=False)
    monkeypatch.setenv("OPS_RECORDER_AUTH_DISABLED", "true")

    assert require_api_key(None) is None


def test_configured_github_repo_validates_owner_repo(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_REPO", "recoder/recoder.xyz")
    assert configured_github_repo() == "recoder/recoder.xyz"

    monkeypatch.setenv("GITHUB_REPO", "recoder/recoder.xyz/extra")
    try:
        configured_github_repo()
    except HTTPException as exc:
        assert exc.status_code == 422
    else:
        raise AssertionError("invalid GitHub repo should be rejected")


def test_configured_linear_team_id_requires_uuid(monkeypatch) -> None:
    team_id = "123e4567-e89b-12d3-a456-426614174000"
    monkeypatch.setenv("LINEAR_TEAM_ID", team_id)
    assert configured_linear_team_id() == team_id

    monkeypatch.setenv("LINEAR_TEAM_ID", "not-a-uuid")
    try:
        configured_linear_team_id()
    except HTTPException as exc:
        assert exc.status_code == 422
    else:
        raise AssertionError("invalid Linear team id should be rejected")
