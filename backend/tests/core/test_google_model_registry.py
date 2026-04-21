from core.ai_models import model_manager


def test_google_gemini_pro_resolves_to_openrouter_runtime_model():
    model = model_manager.get("google/gemini-2.5-pro")

    assert model is not None
    assert model.litellm_model_id == "openrouter/google/gemini-2.5-pro"
    assert model_manager.get_litellm_model_id("google/gemini-2.5-pro") == "openrouter/google/gemini-2.5-pro"


def test_google_gemini_flash_resolves_to_openrouter_runtime_model():
    model = model_manager.get("google/gemini-2.5-flash")

    assert model is not None
    assert model.litellm_model_id == "openrouter/google/gemini-2.5-flash"
    assert model_manager.get_litellm_model_id("google/gemini-2.5-flash") == "openrouter/google/gemini-2.5-flash"
