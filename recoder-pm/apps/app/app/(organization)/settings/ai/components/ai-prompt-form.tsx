"use client";

import { Textarea } from "@repo/design-system/components/precomposed/textarea";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { updateAiPrompt } from "@/actions/organization/update-ai-prompt";

type AiPromptFormProps = {
  readonly defaultValue: string;
};

export const AiPromptForm = ({ defaultValue }: AiPromptFormProps) => {
  const [prompt, setPrompt] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const disabled = loading;
  const maxRecommended = 2000;
  const promptLength = prompt.trim().length;
  const isLong = promptLength > maxRecommended;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await updateAiPrompt({ prompt });

      if (error) {
        throw new Error(error);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="w-full space-y-3" onSubmit={handleSubmit}>
      <Textarea
        className="max-h-[20rem] min-h-[10rem] resize-y bg-background"
        onChangeText={setPrompt}
        placeholder="Example: Use our product voice (direct, actionable). Prefer bullet points. Mention enterprise customers first when relevant."
        value={prompt}
      />
      <p className="text-muted-foreground text-sm">
        These instructions are appended to every AI request for your
        organization.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={isLong ? "text-warning" : "text-muted-foreground"}>
          {promptLength}/{maxRecommended} recommended characters
        </span>
        <button
          className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setPrompt("")}
          type="button"
        >
          Clear instructions
        </button>
      </div>
      <Button disabled={disabled} type="submit">
        Save
      </Button>
    </form>
  );
};
