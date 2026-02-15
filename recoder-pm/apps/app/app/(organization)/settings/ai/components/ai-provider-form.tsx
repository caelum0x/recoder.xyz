"use client";

import { Input } from "@repo/design-system/components/precomposed/input";
import { Select } from "@repo/design-system/components/precomposed/select";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AiProvider,
  updateAiSettings,
} from "@/actions/organization/update-ai-settings";

const providers: { label: string; value: AiProvider }[] = [
  { label: "OpenRouter", value: "openrouter" },
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
];

const providerLabels: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

const providerHints: Record<
  AiProvider,
  {
    modelPlaceholder: string;
    examples: string[];
    help: string;
    docsUrl: string;
    recommended: string;
  }
> = {
  openrouter: {
    modelPlaceholder: "openai/gpt-5-nano",
    examples: ["openai/gpt-5-nano", "anthropic/claude-3.5-sonnet"],
    help: "Use any OpenRouter model slug.",
    docsUrl: "https://openrouter.ai/models",
    recommended: "openai/gpt-5-nano",
  },
  openai: {
    modelPlaceholder: "gpt-5-nano",
    examples: ["gpt-5-nano", "gpt-4.1-mini"],
    help: "Use OpenAI model IDs (no provider prefix).",
    docsUrl: "https://platform.openai.com/docs/models",
    recommended: "gpt-5-nano",
  },
  anthropic: {
    modelPlaceholder: "claude-3.5-sonnet-latest",
    examples: ["claude-3.5-sonnet-latest", "claude-3-5-haiku-latest"],
    help: "Use Anthropic model IDs.",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    recommended: "claude-3.5-sonnet-latest",
  },
};

const normalizeModelForProvider = (
  targetProvider: AiProvider,
  value: string
) => {
  const trimmed = value.trim();
  if (targetProvider === "openrouter" || !trimmed.includes("/")) {
    return trimmed;
  }
  return trimmed.split("/").slice(1).join("/");
};

const getModelWarning = (
  targetProvider: AiProvider,
  modelValue: string
): string | null => {
  if (!modelValue) {
    return null;
  }

  if (targetProvider === "openrouter" && !modelValue.includes("/")) {
    return "OpenRouter models should include a provider prefix (example: openai/gpt-5-nano).";
  }

  if (targetProvider !== "openrouter" && modelValue.includes("/")) {
    return "OpenAI/Anthropic models should not include a provider prefix.";
  }

  return null;
};

const useProviderModels = (provider: AiProvider) => {
  const [modelsLoading, setModelsLoading] = useState<
    Record<AiProvider, boolean>
  >({
    openrouter: false,
    openai: false,
    anthropic: false,
  });
  const [modelsError, setModelsError] = useState<
    Record<AiProvider, string | null>
  >({
    openrouter: null,
    openai: null,
    anthropic: null,
  });
  const [modelsByProvider, setModelsByProvider] = useState<
    Record<AiProvider, string[]>
  >({
    openrouter: [],
    openai: [],
    anthropic: [],
  });

  const loadModels = useCallback(
    async (targetProvider: AiProvider, force = false) => {
      const endpoint = `/api/ai-models/${targetProvider}`;
      const existing = modelsByProvider[targetProvider];
      const isLoading = modelsLoading[targetProvider];

      if (!force && (existing.length > 0 || isLoading)) {
        return;
      }

      setModelsLoading((prev) => ({ ...prev, [targetProvider]: true }));
      setModelsError((prev) => ({ ...prev, [targetProvider]: null }));

      try {
        const response = await fetch(endpoint);
        const data = (await response.json()) as {
          models?: string[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to load models");
        }

        setModelsByProvider((prev) => ({
          ...prev,
          [targetProvider]: data.models ?? [],
        }));
      } catch (error) {
        setModelsError((prev) => ({
          ...prev,
          [targetProvider]:
            (error as Error).message ||
            `Unable to load ${targetProvider} models right now.`,
        }));
      } finally {
        setModelsLoading((prev) => ({ ...prev, [targetProvider]: false }));
      }
    },
    [modelsByProvider, modelsLoading]
  );

  useEffect(() => {
    loadModels(provider).catch(() => undefined);
  }, [provider, loadModels]);

  useEffect(() => {
    const interval = setInterval(
      () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        ) {
          return;
        }
        loadModels(provider, true).catch(() => undefined);
      },
      10 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [provider, loadModels]);

  useEffect(() => {
    const handleFocus = () => {
      loadModels(provider, true).catch(() => undefined);
    };

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [provider, loadModels]);

  const resetProviderModels = useCallback((targetProvider: AiProvider) => {
    setModelsByProvider((prev) => ({
      ...prev,
      [targetProvider]: [],
    }));
  }, []);

  return {
    modelsByProvider,
    modelsLoading,
    modelsError,
    loadModels,
    resetProviderModels,
  };
};

type AiProviderFormProps = {
  readonly provider: AiProvider;
  readonly model: string;
  readonly keyPrefix: string | null;
};

export const AiProviderForm = ({
  provider: defaultProvider,
  model: defaultModel,
  keyPrefix,
}: AiProviderFormProps) => {
  const [provider, setProvider] = useState<AiProvider>(defaultProvider);
  const [model, setModel] = useState(defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const {
    modelsByProvider,
    modelsLoading,
    modelsError,
    loadModels,
    resetProviderModels,
  } = useProviderModels(provider);

  const disabled = loading || !provider;
  const hint = providerHints[provider];
  const modelValue = model.trim();
  const modelWarning = getModelWarning(provider, modelValue);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled || modelWarning) {
      return;
    }

    const normalizedModel = normalizeModelForProvider(provider, model);
    setModel(normalizedModel);

    setLoading(true);

    try {
      const { error } = await updateAiSettings({
        provider,
        model: normalizedModel,
        apiKey: apiKey.trim() ? apiKey : undefined,
      });

      if (error) {
        throw new Error(error);
      }

      setApiKey("");
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const showKeyPrefix = provider === defaultProvider ? keyPrefix : null;
  const isSaveDisabled = disabled || Boolean(modelWarning);
  const modelsErrorMessage = modelsError[provider];

  const applyModelInput = useCallback(
    (value: string) => {
      setModel(normalizeModelForProvider(provider, value));
    },
    [provider]
  );

  const filteredModels = useMemo(() => {
    const models = modelsByProvider[provider] ?? [];

    const query = modelQuery.trim().toLowerCase();

    if (!query) {
      return models.slice(0, 12);
    }

    return models
      .filter((modelId) => modelId.toLowerCase().includes(query))
      .slice(0, 12);
  }, [provider, modelQuery, modelsByProvider]);

  return (
    <form className="w-full space-y-4" onSubmit={handleSubmit}>
      <Select
        data={providers}
        label="Provider"
        onChange={(value) => {
          setProvider(value);
          setModel("");
          setApiKey("");
          setModelQuery("");
        }}
        value={provider}
      />
      <Input
        className="bg-background"
        label="Model (Optional)"
        onChangeText={(value) => {
          applyModelInput(value);
        }}
        placeholder={hint.modelPlaceholder}
        value={model}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="-ml-2 h-7 px-2 text-xs"
          onClick={() => setModel(hint.recommended)}
          size="sm"
          type="button"
          variant="outline"
        >
          Use recommended
        </Button>
        {modelWarning ? (
          <p className="text-sm text-warning">{modelWarning}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Example: {hint.modelPlaceholder}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-sm">{hint.help}</p>
        <Button
          asChild
          className="-ml-2 h-7 px-2 text-xs"
          size="sm"
          variant="ghost"
        >
          <Link href={hint.docsUrl} rel="noreferrer" target="_blank">
            Model docs
          </Link>
        </Button>
      </div>
      {provider ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-sm">
              Browse {providerLabels[provider]} models
            </p>
            {modelsLoading[provider] ? (
              <Badge variant="secondary">Loading...</Badge>
            ) : null}
          </div>
          <div className="mt-2">
            <Input
              className="bg-background"
              label="Search models"
              onChangeText={setModelQuery}
              placeholder={`Search ${provider} models`}
              value={modelQuery}
            />
          </div>
          {modelQuery.trim() ? (
            <div className="mt-2">
              <Button
                onClick={() => {
                  applyModelInput(modelQuery);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Use search as model
              </Button>
            </div>
          ) : null}
          {modelsErrorMessage ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-destructive text-sm">
              <span>{modelsErrorMessage}</span>
              <button
                className="rounded-full border border-destructive/40 px-2 py-0.5 text-destructive text-xs transition hover:border-destructive hover:bg-destructive/10"
                onClick={() => {
                  resetProviderModels(provider);
                  loadModels(provider, true).catch(() => undefined);
                }}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredModels.map((modelId) => (
              <button
                className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                key={modelId}
                onClick={() => setModel(modelId)}
                type="button"
              >
                <Badge className="cursor-pointer" variant="secondary">
                  {modelId}
                </Badge>
              </button>
            ))}
            {!(modelsLoading[provider] || modelsError[provider]) &&
            filteredModels.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No models match your search.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {hint.examples.map((example) => (
          <button
            className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            key={example}
            onClick={() => {
              applyModelInput(example);
            }}
            type="button"
          >
            <Badge className="cursor-pointer" variant="secondary">
              {example}
            </Badge>
          </button>
        ))}
      </div>
      <Input
        className="bg-background"
        label="API Key (Optional)"
        onChangeText={setApiKey}
        placeholder="sk-..."
        type="password"
        value={apiKey}
      />
      {showKeyPrefix ? (
        <p className="text-muted-foreground text-sm">
          Stored key: {showKeyPrefix}
        </p>
      ) : null}
      <Button disabled={isSaveDisabled} type="submit">
        Save
      </Button>
    </form>
  );
};
