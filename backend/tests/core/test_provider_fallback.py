import pytest
from core.ai.provider_fallback import FallbackRouter, FallbackChain

def test_fallback_chain_returns_next_model():
    chain = FallbackChain(models=["claude-sonnet-4", "gpt-5.1", "gemini-2.5-flash"])
    assert chain.primary() == "claude-sonnet-4"
    assert chain.next_after("claude-sonnet-4") == "gpt-5.1"
    assert chain.next_after("gpt-5.1") == "gemini-2.5-flash"
    assert chain.next_after("gemini-2.5-flash") is None

def test_fallback_router_selects_chain():
    router = FallbackRouter()
    chain = router.get_chain("claude-sonnet-4")
    assert chain is not None
    assert chain.primary() == "claude-sonnet-4"

def test_fallback_router_unknown_model():
    router = FallbackRouter()
    chain = router.get_chain("unknown-model")
    assert chain is not None
    assert chain.primary() == "unknown-model"
    assert chain.next_after("unknown-model") is None
