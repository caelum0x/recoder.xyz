from typing import Dict, List, Optional, Tuple, Any
from .models import Model, ModelProvider, ModelCapability, ModelPricing, ModelConfig, ReasoningSettings
from .providers import provider_registry
from .providers.anthropic import BedrockProvider
from core.utils.config import config, EnvMode
from core.utils.logger import logger

import httpx
import asyncio
import time
import logging
import os


class BedrockConfig:
    REGION = "us-west-2"
    ACCOUNT_ID = "935064898258"
    
    PROFILE_IDS = {
        "haiku_4_5": "heol2zyy5v48",
        "sonnet_4_5": "few7z4l830xh",
        "kimi_k2": "hfgufmm5fgcq",
        "minimax_m2": "zix3khptbyoe",
    }
    
    @classmethod
    def build_arn(cls, profile_id: str) -> str:
        return f"bedrock/converse/arn:aws:bedrock:{cls.REGION}:{cls.ACCOUNT_ID}:application-inference-profile/{profile_id}"
    
    @classmethod
    def get_haiku_arn(cls) -> str:
        return cls.build_arn(cls.PROFILE_IDS["haiku_4_5"])
    
    @classmethod
    def get_sonnet_arn(cls) -> str:
        return cls.build_arn(cls.PROFILE_IDS["sonnet_4_5"])


class PricingPresets:
    HAIKU_4_5 = ModelPricing(
        input_cost_per_million_tokens=1.00,
        output_cost_per_million_tokens=5.00,
        cached_read_cost_per_million_tokens=0.10,
        cache_write_5m_cost_per_million_tokens=1.25,
        cache_write_1h_cost_per_million_tokens=2.00,
    )
    
    MINIMAX_M2 = ModelPricing(
        input_cost_per_million_tokens=0.30,
        output_cost_per_million_tokens=1.20,
        cached_read_cost_per_million_tokens=0.03,
        cache_write_5m_cost_per_million_tokens=0.375,
    )
    
    GROK_4_1_FAST = ModelPricing(
        input_cost_per_million_tokens=0.20,
        output_cost_per_million_tokens=0.50,
        cached_read_cost_per_million_tokens=0.05,
    )
    
    GPT_4O_MINI = ModelPricing(
        input_cost_per_million_tokens=0.15,
        output_cost_per_million_tokens=0.60,
        cached_read_cost_per_million_tokens=0.075,
    )

    MIMO_V2_FLASH = ModelPricing(
        input_cost_per_million_tokens=0.10,
        output_cost_per_million_tokens=0.30,
        cached_read_cost_per_million_tokens=0.02,
    )

    KIMI_K2 = ModelPricing(
        input_cost_per_million_tokens=0.40,
        output_cost_per_million_tokens=1.75,
        cached_read_cost_per_million_tokens=0.15,
    )

    KIMI_K2_5 = ModelPricing(
        input_cost_per_million_tokens=0.60,
        output_cost_per_million_tokens=3.00,
        cached_read_cost_per_million_tokens=0.10,
    )

    HAIKU_3_5 = ModelPricing(
        input_cost_per_million_tokens=0.80,
        output_cost_per_million_tokens=4.00,
        cached_read_cost_per_million_tokens=0.08,
    )

    DEEPSEEK_V3 = ModelPricing(
        input_cost_per_million_tokens=0.14,
        output_cost_per_million_tokens=0.28,
        cached_read_cost_per_million_tokens=0.014,
    )


FREE_MODEL_ID = "recoder/power"
PREMIUM_MODEL_ID = "recoder/power"
IMAGE_MODEL_ID = "recoder/haiku"


def _create_anthropic_model_config() -> ModelConfig:
    return ModelConfig()


def _create_minimax_model_config() -> ModelConfig:
    return ModelConfig(
        reasoning=ReasoningSettings(enabled=True, split_output=True),
        extra_body={"app": "Recoder.xyz"},
    )

def _create_kimi_model_config() -> ModelConfig:
    
    
    return ModelConfig(
        reasoning=ReasoningSettings(enabled=True)
        # reasoning always
        # reasoning=ReasoningSettings(enabled=True)

    )



def _should_use_bedrock() -> bool:
    return config.ENV_MODE in (EnvMode.STAGING, EnvMode.PRODUCTION) and config.MAIN_LLM == "bedrock"


def _get_main_llm() -> str:
    return getattr(config, 'MAIN_LLM', 'bedrock')


def _get_main_llm_model() -> Optional[str]:
    return getattr(config, 'MAIN_LLM_MODEL', None)

class ModelFactory:
    
    @staticmethod
    def create_anthropic_haiku(use_bedrock: bool = False) -> Model:
        if use_bedrock:
            litellm_id = BedrockConfig.get_haiku_arn()
            provider = ModelProvider.BEDROCK
        else:
            litellm_id = "anthropic/claude-haiku-4-5-20251001"
            provider = ModelProvider.ANTHROPIC
        
        return Model(
            id="recoder/haiku",
            name="Claude Haiku 4.5",
            litellm_model_id=litellm_id,
            provider=provider,
            aliases=[litellm_id],
            context_window=200_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.HAIKU_4_5,
            tier_availability=["free", "paid"],
            priority=50,
            recommended=False,
            enabled=True,
            config=_create_anthropic_model_config(),
        )
    
    @staticmethod
    def create_minimax_m2(use_openrouter: bool = True) -> Model:
        # Use OpenRouter paid model — low cost, 262K context, coding-focused
        litellm_id = "openrouter/qwen/qwen3-coder"
        provider = ModelProvider.OPENROUTER

        return Model(
            id="recoder/minimax",
            name="Recoder Free",
            litellm_model_id=litellm_id,
            provider=provider,
            aliases=["minimax-m2", "minimax-m2.1", "recoder-free", "free"],
            context_window=200_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.THINKING,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.MINIMAX_M2,
            tier_availability=["free", "paid"],
            priority=100,
            recommended=False,
            enabled=True,
            config=_create_minimax_model_config(),
        )
    
    @staticmethod
    def create_basic_model(main_llm: str, custom_model: Optional[str] = None) -> Model:
        # Default models per provider
        default_models = {
            "bedrock": BedrockConfig.get_haiku_arn(),
            "anthropic": "anthropic/claude-haiku-4-5-20251001",
            "grok": "openrouter/qwen/qwen3-coder",
            "openai": "openrouter/qwen/qwen3-coder",
            "minimax": "openrouter/qwen/qwen3-coder",
            "kimi": "openrouter/qwen/qwen3-coder",
        }

        if main_llm == "kimi":
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["kimi"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=262_144,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.PROMPT_CACHING,
                    ModelCapability.THINKING,
                ],
                pricing=PricingPresets.KIMI_K2_5,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
                config=_create_kimi_model_config(),
            )
        elif main_llm == "bedrock":
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["bedrock"],
                provider=ModelProvider.BEDROCK,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.HAIKU_4_5,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
                config=_create_anthropic_model_config(),
            )
        elif main_llm == "anthropic":
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["anthropic"],
                provider=ModelProvider.ANTHROPIC,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.HAIKU_4_5,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
                config=_create_anthropic_model_config(),
            )
        elif main_llm == "grok":
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["grok"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=2_000_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.GROK_4_1_FAST,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
            )
        elif main_llm == "openai":
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["openai"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=128_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                ],
                pricing=PricingPresets.GPT_4O_MINI,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
            )
        elif main_llm == "openrouter":
            # Generic OpenRouter - use custom model or fallback to minimax
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["minimax"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                ],
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
            )
        else:  # minimax or unknown
            return Model(
                id="recoder/basic",
                name="Recoder Basic",
                litellm_model_id=custom_model or default_models["minimax"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-basic", "Recoder Basic"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.MINIMAX_M2,
                tier_availability=["free", "paid"],
                priority=102,
                recommended=True,
                enabled=True,
                config=_create_minimax_model_config(),
            )
    
    @staticmethod
    def create_power_model(main_llm: str, custom_model: Optional[str] = None) -> Model:
        # Default models per provider
        # Use claude-sonnet for reliable tool calling (slides, excel, coding, image gen)
        default_models = {
            "bedrock": BedrockConfig.get_haiku_arn(),
            "anthropic": "anthropic/claude-haiku-4-5-20251001",
            "grok": "openrouter/anthropic/claude-sonnet-4",
            "openai": "openrouter/anthropic/claude-sonnet-4",
            "minimax": "openrouter/anthropic/claude-sonnet-4",
            "kimi": "openrouter/anthropic/claude-sonnet-4",
        }

        if main_llm == "kimi":
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["kimi"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=262_144,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.KIMI_K2_5,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
                config=_create_kimi_model_config(),
            )
        elif main_llm == "bedrock":
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["bedrock"],
                provider=ModelProvider.BEDROCK,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.HAIKU_4_5,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
                config=_create_anthropic_model_config(),
            )
        elif main_llm == "anthropic":
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["anthropic"],
                provider=ModelProvider.ANTHROPIC,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.HAIKU_4_5,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
                config=_create_anthropic_model_config(),
            )
        elif main_llm == "grok":
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["grok"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=2_000_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.GROK_4_1_FAST,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
            )
        elif main_llm == "openai":
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["openai"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=128_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                ],
                pricing=PricingPresets.GPT_4O_MINI,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
            )
        elif main_llm == "openrouter":
            # Generic OpenRouter - use custom model or fallback to minimax
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["minimax"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.VISION,
                ],
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
            )
        else:  # minimax or unknown
            return Model(
                id="recoder/power",
                name="Recoder",
                litellm_model_id=custom_model or default_models["minimax"],
                provider=ModelProvider.OPENROUTER,
                aliases=["recoder-power", "Recoder POWER Mode", "Recoder Power", "Recoder Advanced Mode", "Recoder"],
                context_window=200_000,
                capabilities=[
                    ModelCapability.CHAT,
                    ModelCapability.FUNCTION_CALLING,
                    ModelCapability.THINKING,
                    ModelCapability.PROMPT_CACHING,
                ],
                pricing=PricingPresets.MINIMAX_M2,
                tier_availability=["free", "paid"],
                priority=101,
                recommended=True,
                enabled=True,
                config=_create_minimax_model_config(),
            )
    
    @staticmethod
    def create_test_model() -> Model:
        return Model(
            id="recoder/test",
            name="Recoder Test",
            litellm_model_id="openrouter/minimax/minimax-m2.1",
            provider=ModelProvider.OPENROUTER,
            aliases=["recoder-test", "Recoder Test"],
            context_window=200_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.THINKING,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.MINIMAX_M2,
            tier_availability=["free", "paid"],
            priority=100,
            recommended=False,
            enabled=True,
            config=_create_minimax_model_config(),
        )
    
    @staticmethod
    def create_grok_4_1_fast() -> Model:
        return Model(
            id="recoder/grok-4-1-fast",
            name="Grok 4.1 Fast",
            litellm_model_id="openrouter/x-ai/grok-4.1-fast",
            provider=ModelProvider.OPENROUTER,
            aliases=["grok-4.1-fast", "grok-4-1-fast", "x-ai/grok-4.1-fast"],
            context_window=2_000_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.GROK_4_1_FAST,
            tier_availability=["paid"],
            priority=90,
            recommended=False,
            enabled=True,
        )
    
    @staticmethod
    def create_gpt4o_mini() -> Model:
        return Model(
            id="recoder/gpt4o-mini",
            name="GPT-4o Mini",
            litellm_model_id="openrouter/openai/gpt-4o-mini",
            provider=ModelProvider.OPENROUTER,
            aliases=["gpt-4o-mini", "gpt4o-mini", "openai/gpt-4o-mini"],
            context_window=128_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
            ],
            pricing=PricingPresets.GPT_4O_MINI,
            tier_availability=["free", "paid"],
            priority=95,
            recommended=True,
            enabled=True,
        )

    @staticmethod
    def create_gpt5_mini() -> Model:
        return Model(
            id="recoder/gpt-5-mini",
            name="GPT-5 Mini",
            litellm_model_id="openrouter/openai/gpt-4o-mini",
            provider=ModelProvider.OPENROUTER,
            aliases=["gpt-4o-mini", "gpt4o-mini", "openai/gpt-4o-mini"],
            context_window=128_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
            ],
            pricing=PricingPresets.GPT_4O_MINI,
            tier_availability=["free", "paid"],
            priority=95,
            recommended=True,
            enabled=True,
        )

    @staticmethod
    def create_mimo_v2_flash() -> Model:
        return Model(
            id="recoder/mimo-v2-flash",
            name="MiMo Flash",
            litellm_model_id="openrouter/xiaomi/mimo-v2-flash",
            provider=ModelProvider.OPENROUTER,
            aliases=["mimo-v2-flash", "xiaomi/mimo-v2-flash", "mimo"],
            context_window=262_144,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.MIMO_V2_FLASH,
            tier_availability=["free", "paid"],
            priority=80,
            recommended=False,
            enabled=True,
        )

    @staticmethod
    def create_deepseek_v3() -> Model:
        return Model(
            id="recoder/deepseek-v3",
            name="DeepSeek V3",
            litellm_model_id="openrouter/deepseek/deepseek-chat-v3-0324",
            provider=ModelProvider.OPENROUTER,
            aliases=["deepseek-v3", "deepseek", "deepseek/deepseek-chat-v3-0324"],
            context_window=128_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.DEEPSEEK_V3,
            tier_availability=["free", "paid"],
            priority=90,
            recommended=False,
            enabled=True,
        )

    @staticmethod
    def create_haiku_3_5() -> Model:
        return Model(
            id="recoder/haiku-3.5",
            name="Claude Haiku 3.5",
            litellm_model_id="bedrock/anthropic.claude-3-5-haiku-20241022-v1:0",
            provider=ModelProvider.BEDROCK,
            aliases=["haiku-3.5", "claude-3.5-haiku", "claude-3-5-haiku"],
            context_window=200_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.HAIKU_3_5,
            tier_availability=["paid"],
            priority=70,
            recommended=False,
            enabled=True,
            config=_create_anthropic_model_config(),
        )

    @staticmethod
    def create_kimi_k2() -> Model:
        return Model(
            id="recoder/kimi-k2",
            name="Kimi K2",
            litellm_model_id="openrouter/moonshotai/kimi-k2",
            provider=ModelProvider.OPENROUTER,
            aliases=["kimi-k2", "moonshotai/kimi-k2"],
            context_window=262_144,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.PROMPT_CACHING,
            ],
            pricing=PricingPresets.KIMI_K2,
            tier_availability=["free", "paid"],
            priority=104,
            recommended=False,
            enabled=True,
            config=_create_kimi_model_config(),
        )

    @staticmethod
    def create_kimi_k2_5() -> Model:
        return Model(
            id="recoder/kimi-k2.5",
            name="Kimi K2.5",
            litellm_model_id="openrouter/moonshotai/kimi-k2.5",
            provider=ModelProvider.OPENROUTER,
            aliases=["kimi-k2.5", "kimi", "moonshotai/kimi-k2.5"],
            context_window=262_144,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
                ModelCapability.PROMPT_CACHING,
                ModelCapability.THINKING
            ],
            pricing=PricingPresets.KIMI_K2_5,
            tier_availability=["free", "paid"],
            priority=105,
            recommended=True,
            enabled=True,
            config=_create_kimi_model_config(),
        )

    @staticmethod
    def create_openrouter_free() -> Model:
        return Model(
            id="openrouter/free",
            name="Gemini Flash (Free)",
            litellm_model_id="openrouter/google/gemini-2.0-flash-exp:free",
            provider=ModelProvider.OPENROUTER,
            aliases=["free", "Auto Free", "openrouter/auto"],
            context_window=1_000_000,
            capabilities=[
                ModelCapability.CHAT,
                ModelCapability.FUNCTION_CALLING,
                ModelCapability.VISION,
            ],
            pricing=ModelPricing(input_cost_per_million_tokens=0, output_cost_per_million_tokens=0),
            tier_availability=["free", "paid"],
            priority=200,  # Highest priority for free users
            recommended=True,
            enabled=True,
        )

# ── Unified model catalog for /v1/models API ──────────────────────────

UNIFIED_PREMIUM_MODELS = [
    {"id": "anthropic/claude-sonnet-4.5", "name": "Claude Sonnet 4.5", "provider": "anthropic", "context_length": 200000, "pricing": {"prompt": 3.0, "completion": 15.0}, "tier": "paid", "speed_tier": "balanced", "recommended": True},
    {"id": "anthropic/claude-opus-4", "name": "Claude Opus 4", "provider": "anthropic", "context_length": 200000, "pricing": {"prompt": 15.0, "completion": 75.0}, "tier": "paid", "speed_tier": "powerful", "recommended": True},
    {"id": "anthropic/claude-haiku-4.5", "name": "Claude Haiku 4.5", "provider": "anthropic", "context_length": 200000, "pricing": {"prompt": 0.80, "completion": 4.0}, "tier": "paid", "speed_tier": "fast", "recommended": False},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "openai", "context_length": 128000, "pricing": {"prompt": 2.50, "completion": 10.0}, "tier": "paid", "speed_tier": "balanced", "recommended": True},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "openai", "context_length": 128000, "pricing": {"prompt": 0.15, "completion": 0.60}, "tier": "paid", "speed_tier": "fast", "recommended": False},
    {"id": "openai/gpt-4.1", "name": "GPT-4.1", "provider": "openai", "context_length": 1047576, "pricing": {"prompt": 2.0, "completion": 8.0}, "tier": "paid", "speed_tier": "balanced", "recommended": False},
    {"id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google", "context_length": 2097152, "pricing": {"prompt": 1.25, "completion": 10.0}, "tier": "paid", "speed_tier": "powerful", "recommended": True},
    {"id": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google", "context_length": 1048576, "pricing": {"prompt": 0.15, "completion": 0.60}, "tier": "paid", "speed_tier": "fast", "recommended": True},
    {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1", "provider": "deepseek", "context_length": 163840, "pricing": {"prompt": 0.55, "completion": 2.19}, "tier": "paid", "speed_tier": "balanced", "recommended": True},
    {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3", "provider": "deepseek", "context_length": 131072, "pricing": {"prompt": 0.14, "completion": 0.28}, "tier": "paid", "speed_tier": "fast", "recommended": False},
    {"id": "x-ai/grok-4", "name": "Grok 4", "provider": "xai", "context_length": 2097152, "pricing": {"prompt": 2.0, "completion": 10.0}, "tier": "paid", "speed_tier": "powerful", "recommended": False},
    {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B", "provider": "meta", "context_length": 131072, "pricing": {"prompt": 0.10, "completion": 0.10}, "tier": "paid", "speed_tier": "fast", "recommended": False},
    {"id": "mistralai/mistral-large", "name": "Mistral Large", "provider": "mistral", "context_length": 128000, "pricing": {"prompt": 2.0, "completion": 6.0}, "tier": "paid", "speed_tier": "balanced", "recommended": False},
    {"id": "qwen/qwen-2.5-coder-32b-instruct", "name": "Qwen 2.5 Coder 32B", "provider": "qwen", "context_length": 131072, "pricing": {"prompt": 0.07, "completion": 0.16}, "tier": "paid", "speed_tier": "balanced", "recommended": False},
]

FREE_ROUTER = {
    "id": "openrouter/free",
    "name": "Auto (Free)",
    "provider": "openrouter",
    "context_length": 200000,
    "pricing": {"prompt": 0, "completion": 0},
    "tier": "free",
    "speed_tier": "balanced",
    "recommended": True,
    "is_free_router": True,
    "description": "Automatically picks the best available free model",
}


class ModelRegistry:

    _free_models_cache: list = []
    _last_free_sync: float = 0
    _FREE_SYNC_INTERVAL = 3600  # 1 hour

    def __init__(self):
        self._models: Dict[str, Model] = {}
        self._aliases: Dict[str, str] = {}
        self._litellm_id_to_pricing: Dict[str, ModelPricing] = {}
        self._initialize_providers()
        self._initialize_models()
    
    def _initialize_providers(self):
        bedrock_provider = BedrockProvider(
            region=BedrockConfig.REGION,
            account_id=BedrockConfig.ACCOUNT_ID,
        )
        provider_registry.register("bedrock", bedrock_provider)
    
    def _initialize_models(self):
        self._register_pricing_mappings()

        main_llm = _get_main_llm()
        custom_model = _get_main_llm_model()
        use_bedrock = _should_use_bedrock()

        self.register(ModelFactory.create_basic_model(main_llm, custom_model))
        self.register(ModelFactory.create_power_model(main_llm, custom_model))
        self.register(ModelFactory.create_anthropic_haiku(use_bedrock))
        self.register(ModelFactory.create_grok_4_1_fast())
        self.register(ModelFactory.create_gpt4o_mini())
        self.register(ModelFactory.create_mimo_v2_flash())
        self.register(ModelFactory.create_kimi_k2())
        self.register(ModelFactory.create_kimi_k2_5())
        self.register(ModelFactory.create_minimax_m2())
        self.register(ModelFactory.create_haiku_3_5())
        self.register(ModelFactory.create_deepseek_v3())
        self.register(ModelFactory.create_openrouter_free())

        if config.ENV_MODE != EnvMode.PRODUCTION:
            self.register(ModelFactory.create_test_model())
    
    def _register_pricing_mappings(self):
        self._litellm_id_to_pricing[BedrockConfig.get_haiku_arn()] = PricingPresets.HAIKU_4_5
        self._litellm_id_to_pricing["minimax/minimax-m2.1"] = PricingPresets.MINIMAX_M2
        self._litellm_id_to_pricing["openrouter/minimax/minimax-m2.1"] = PricingPresets.MINIMAX_M2
        self._litellm_id_to_pricing["openrouter/x-ai/grok-4.1-fast"] = PricingPresets.GROK_4_1_FAST
        self._litellm_id_to_pricing["openrouter/openai/gpt-4o-mini"] = PricingPresets.GPT_4O_MINI
        self._litellm_id_to_pricing["openrouter/xiaomi/mimo-v2-flash"] = PricingPresets.MIMO_V2_FLASH
        self._litellm_id_to_pricing["openrouter/moonshotai/kimi-k2"] = PricingPresets.KIMI_K2
        self._litellm_id_to_pricing["openrouter/moonshotai/kimi-k2.5"] = PricingPresets.KIMI_K2_5
        self._litellm_id_to_pricing["bedrock/anthropic.claude-3-5-haiku-20241022-v1:0"] = PricingPresets.HAIKU_3_5
        self._litellm_id_to_pricing["openrouter/deepseek/deepseek-chat-v3-0324"] = PricingPresets.DEEPSEEK_V3
    
    def register(self, model: Model) -> None:
        self._models[model.id] = model
        for alias in model.aliases:
            self._aliases[alias] = model.id
    
    def get(self, model_id: str) -> Optional[Model]:
        if not model_id:
            return None
        
        if model_id in self._models:
            return self._models[model_id]
        
        if model_id in self._aliases:
            actual_id = self._aliases[model_id]
            return self._models.get(actual_id)
        
        return None
    
    def get_model(self, model_id: str) -> Optional[Model]:
        return self.get(model_id)
    
    def get_all(self, enabled_only: bool = True) -> List[Model]:
        models = list(self._models.values())
        if enabled_only:
            models = [m for m in models if m.enabled]
        return models
    
    def get_by_tier(self, tier: str, enabled_only: bool = True) -> List[Model]:
        models = self.get_all(enabled_only)
        return [m for m in models if tier in m.tier_availability]
    
    def get_by_provider(self, provider: ModelProvider, enabled_only: bool = True) -> List[Model]:
        models = self.get_all(enabled_only)
        return [m for m in models if m.provider == provider]
    
    def get_by_capability(self, capability: ModelCapability, enabled_only: bool = True) -> List[Model]:
        models = self.get_all(enabled_only)
        return [m for m in models if capability in m.capabilities]
    
    def resolve_model_id(self, model_id: str) -> Optional[str]:
        resolved = self.get(model_id)
        if resolved:
            return resolved.id
        
        reverse_resolved = self.resolve_from_litellm_id(model_id)
        if reverse_resolved != model_id:
            return reverse_resolved
        
        return model_id
    
    def get_litellm_model_id(self, model_id: str) -> str:
        model = self.get(model_id)
        if model:
            return model.litellm_model_id
        return model_id
    
    def supports_vision(self, model_id: str) -> bool:
        model = self.get(model_id)
        if model:
            return model.supports_vision
        return False
    
    def get_litellm_params(self, model_id: str, **override_params) -> Dict[str, Any]:
        model = self.get(model_id)
        if not model:
            return {
                "model": model_id,
                "num_retries": 5,
                **override_params
            }
        
        params = model.get_litellm_params(**override_params)
        params["model"] = self.get_litellm_model_id(model_id)
        
        return params
    
    def _normalize_model_id(self, model_id: str) -> str:
        if not model_id:
            return model_id
        
        provider_prefixes = ['openrouter/', 'anthropic/', 'bedrock/', 'openai/', 'minimax/']
        
        for prefix in provider_prefixes:
            if model_id.startswith(prefix):
                return model_id
        
        return f"openrouter/{model_id}"
    
    def resolve_from_litellm_id(self, litellm_model_id: str) -> str:
        for model in self._models.values():
            if model.litellm_model_id == litellm_model_id:
                return model.id
        
        normalized_id = self._normalize_model_id(litellm_model_id)
        if normalized_id != litellm_model_id:
            for model in self._models.values():
                if model.litellm_model_id == normalized_id:
                    return model.id
        
        if self.get(litellm_model_id):
            return litellm_model_id
        
        return litellm_model_id
    
    def get_pricing_for_litellm_id(self, litellm_model_id: str) -> Optional[ModelPricing]:
        resolved_id = self.resolve_from_litellm_id(litellm_model_id)
        model = self.get(resolved_id)
        if model and model.pricing:
            return model.pricing
        
        if litellm_model_id in self._litellm_id_to_pricing:
            return self._litellm_id_to_pricing[litellm_model_id]
        
        normalized_id = self._normalize_model_id(litellm_model_id)
        if normalized_id in self._litellm_id_to_pricing:
            return self._litellm_id_to_pricing[normalized_id]
        
        if "application-inference-profile" in litellm_model_id:
            profile_id = litellm_model_id.split("/")[-1] if "/" in litellm_model_id else None
            if profile_id == BedrockConfig.PROFILE_IDS["haiku_4_5"]:
                return PricingPresets.HAIKU_4_5
        
        return None
    
    def get_aliases(self, model_id: str) -> List[str]:
        model = self.get(model_id)
        return model.aliases if model else []
    
    def enable_model(self, model_id: str) -> bool:
        model = self.get(model_id)
        if model:
            model.enabled = True
            return True
        return False
    
    def disable_model(self, model_id: str) -> bool:
        model = self.get(model_id)
        if model:
            model.enabled = False
            return True
        return False
    
    def get_context_window(self, model_id: str, default: int = 31_000) -> int:
        model = self.get(model_id)
        if model:
            return model.context_window
        return default
    
    def get_pricing(self, model_id: str) -> Optional[ModelPricing]:
        model = self.get(model_id)
        if model and model.pricing:
            return model.pricing
        
        return self.get_pricing_for_litellm_id(model_id)
    
    def validate_model(self, model_id: str) -> Tuple[bool, str]:
        model = self.get(model_id)
        
        if not model:
            return False, f"Model '{model_id}' not found"
        
        if not model.enabled:
            return False, f"Model '{model.name}' is currently disabled"
        
        return True, ""
    
    def select_best_model(
        self,
        tier: str,
        required_capabilities: Optional[List[ModelCapability]] = None,
        min_context_window: Optional[int] = None,
        prefer_cheaper: bool = False
    ) -> Optional[Model]:
        models = self.get_by_tier(tier, enabled_only=True)
        
        if required_capabilities:
            models = [
                m for m in models
                if all(cap in m.capabilities for cap in required_capabilities)
            ]
        
        if min_context_window:
            models = [m for m in models if m.context_window >= min_context_window]
        
        if not models:
            return None
        
        if prefer_cheaper and any(m.pricing for m in models):
            models_with_pricing = [m for m in models if m.pricing]
            if models_with_pricing:
                models = sorted(
                    models_with_pricing,
                    key=lambda m: m.pricing.input_cost_per_million_tokens
                )
        else:
            models = sorted(
                models,
                key=lambda m: (-m.priority, not m.recommended)
            )
        
        return models[0] if models else None
    
    def get_default_model(self, tier: str = "free") -> Optional[Model]:
        models = self.get_by_tier(tier, enabled_only=True)
        
        recommended = [m for m in models if m.recommended]
        if recommended:
            recommended = sorted(recommended, key=lambda m: -m.priority)
            return recommended[0]
        
        if models:
            models = sorted(models, key=lambda m: -m.priority)
            return models[0]
        
        return None
    
    async def get_default_model_for_user(self, client, user_id: str) -> str:
        try:
            if config.ENV_MODE == EnvMode.LOCAL:
                return PREMIUM_MODEL_ID
            
            from core.billing.subscriptions import subscription_service
            
            subscription_info = await subscription_service.get_subscription(user_id)
            subscription = subscription_info.get('subscription')
            
            is_paid_tier = False
            if subscription:
                tier_info = subscription_info.get('tier', {})
                if tier_info and tier_info.get('name') not in ('free', 'none'):
                    is_paid_tier = True
            
            return PREMIUM_MODEL_ID if is_paid_tier else FREE_MODEL_ID
            
        except Exception as e:
            logger.warning(f"Failed to determine user tier for {user_id}: {e}")
            return FREE_MODEL_ID
    
    def check_token_limit(
        self,
        model_id: str,
        token_count: int,
        is_input: bool = True
    ) -> Tuple[bool, int]:
        model = self.get(model_id)
        if not model:
            return False, 0
        
        max_allowed = model.context_window
        return token_count <= max_allowed, max_allowed
    
    def format_model_info(self, model_id: str) -> Dict[str, Any]:
        model = self.get(model_id)
        if not model:
            return {"error": f"Model '{model_id}' not found"}
        
        return {
            "id": model.id,
            "name": model.name,
            "aliases": model.aliases,
            "context_window": model.context_window,
            "capabilities": [cap.value for cap in model.capabilities],
            "enabled": model.enabled,
            "tier_availability": model.tier_availability,
            "priority": model.priority,
            "recommended": model.recommended,
        }
    
    def list_available_models(
        self,
        tier: Optional[str] = None,
        include_disabled: bool = False
    ) -> List[Dict[str, Any]]:
        if tier:
            models = self.get_by_tier(tier, enabled_only=not include_disabled)
        else:
            models = self.get_all(enabled_only=not include_disabled)
        
        if not models:
            logger.warning(f"No models found for tier '{tier}'")
        
        models = sorted(
            models,
            key=lambda m: (not m.is_free_tier, -m.priority, m.name)
        )
        
        return [self.format_model_info(m.id) for m in models]

    # ── Unified /v1/models API methods ─────────────────────────────────

    async def sync_free_models(self):
        """Fetch all free models from OpenRouter API."""
        try:
            api_key = os.environ.get("OPENROUTER_API_KEY", "")
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()

            free_models = []
            for model in data.get("data", []):
                pricing = model.get("pricing", {})
                prompt_cost = float(pricing.get("prompt", "1") or "1")
                completion_cost = float(pricing.get("completion", "1") or "1")

                if prompt_cost == 0 and completion_cost == 0:
                    model_id = model.get("id", "")
                    free_models.append({
                        "id": model_id,
                        "name": model.get("name", model_id),
                        "provider": model_id.split("/")[0] if "/" in model_id else "unknown",
                        "context_length": model.get("context_length", 4096),
                        "pricing": {"prompt": 0, "completion": 0},
                        "tier": "free",
                        "speed_tier": "fast",
                        "recommended": False,
                    })

            ModelRegistry._free_models_cache = free_models
            ModelRegistry._last_free_sync = time.time()
            logging.info(f"[ModelRegistry] Synced {len(free_models)} free models from OpenRouter")

        except Exception as e:
            logging.error(f"[ModelRegistry] Failed to sync free models: {e}")
            # Keep existing cache if available

    def get_unified_models(self) -> list:
        """Return all models: free router + dynamic free + static premium."""
        models: list = [FREE_ROUTER]
        models.extend(ModelRegistry._free_models_cache)
        models.extend(UNIFIED_PREMIUM_MODELS)
        return models

    @property
    def last_free_sync_time(self) -> Optional[str]:
        if ModelRegistry._last_free_sync:
            from datetime import datetime, timezone
            return datetime.fromtimestamp(ModelRegistry._last_free_sync, tz=timezone.utc).isoformat()
        return None


registry = ModelRegistry()


async def start_free_model_sync():
    """Background task to sync free models periodically."""
    while True:
        await registry.sync_free_models()
        await asyncio.sleep(ModelRegistry._FREE_SYNC_INTERVAL)


HAIKU_BEDROCK_ARN = BedrockConfig.get_haiku_arn()
SONNET_BEDROCK_ARN = BedrockConfig.get_sonnet_arn()
HAIKU_PRICING = PricingPresets.HAIKU_4_5
HAIKU_4_5_PROFILE_ID = BedrockConfig.PROFILE_IDS["haiku_4_5"]
