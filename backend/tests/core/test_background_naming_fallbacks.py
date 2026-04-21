from core.utils.project_helpers import _fallback_project_title
from core.utils.thread_name_generator import _fallback_thread_title


def test_project_title_fallback_strips_attachment_marker_and_truncates():
    prompt = 'build a customer portal dashboard [Attached: requirements.pdf]'

    title = _fallback_project_title(prompt)

    assert title == "Build A Customer Portal"


def test_thread_title_fallback_uses_more_words_for_context():
    prompt = "fix dashboard loop and manual email verification bug in recoder app"

    title = _fallback_thread_title(prompt)

    assert title == "Fix Dashboard Loop And Manual Email"


def test_naming_fallbacks_handle_empty_prompt():
    assert _fallback_project_title("") == "New Project"
    assert _fallback_thread_title("") == "New Chat"
