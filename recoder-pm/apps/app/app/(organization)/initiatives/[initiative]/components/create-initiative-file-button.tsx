"use client";

import type { Initiative } from "@repo/backend/prisma/client";
import { LoadingCircle } from "@repo/design-system/components/loading-circle";
import { Tooltip } from "@repo/design-system/components/precomposed/tooltip";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { PlusIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { createInitiativeFile } from "@/actions/initiative-file/create";

type CreateInitiativeFileButtonProperties = {
  readonly initiativeId: Initiative["id"];
};

export const CreateInitiativeFileButton = (
  props: CreateInitiativeFileButtonProperties
) => {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || loading) {
      return;
    }

    const selectedFile = Array.from(event.target.files).at(0);

    if (!selectedFile) {
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }
      const { url } = (await uploadResponse.json()) as { url: string };

      const result = await createInitiativeFile({
        initiativeId: props.initiativeId,
        data: {
          name: selectedFile.name,
          url,
        },
      });

      if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading ? (
        <LoadingCircle dimensions="-m-1.5 h-4 w-4" />
      ) : (
        <Tooltip content="Upload a new file">
          <Button
            className="-m-1.5 h-6 w-6"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
            size="icon"
            variant="ghost"
          >
            <PlusIcon size={16} />
            <span className="sr-only">Upload file</span>
          </Button>
        </Tooltip>
      )}
      <input
        className="sr-only hidden"
        disabled={loading}
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
    </>
  );
};
