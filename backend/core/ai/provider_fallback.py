from dataclasses import dataclass, field

PREMIUM_CHAIN = ["claude-sonnet-4", "gpt-5.1", "gemini-2.5-flash"]
STANDARD_CHAIN = ["deepseek-v3", "qwen3-coder", "gemini-2.0-flash"]

MODEL_TO_CHAIN: dict[str, list[str]] = {}
for chain in [PREMIUM_CHAIN, STANDARD_CHAIN]:
    for model in chain:
        MODEL_TO_CHAIN[model] = chain


@dataclass
class FallbackChain:
    models: list[str] = field(default_factory=list)

    def primary(self) -> str:
        return self.models[0] if self.models else ""

    def next_after(self, model: str) -> str | None:
        try:
            idx = self.models.index(model)
            if idx + 1 < len(self.models):
                return self.models[idx + 1]
        except ValueError:
            pass
        return None


class FallbackRouter:
    def get_chain(self, model: str) -> FallbackChain:
        chain_models = MODEL_TO_CHAIN.get(model, [model])
        return FallbackChain(models=chain_models)
