"use client";

import type { Organization } from "@repo/backend/prisma/client";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@repo/design-system/components/kibo-ui/dropzone";
import { handleError } from "@repo/design-system/lib/handle-error";
import Image from "next/image";
import { useState } from "react";
import { updateOrganization } from "@/actions/organization/update";

type OrganizationLogoFormProperties = {
  readonly organizationId: Organization["id"];
  readonly logoUrl: string | null;
};

export const OrganizationLogoForm = ({
  organizationId: _organizationId,
  logoUrl,
}: OrganizationLogoFormProperties) => {
  const [tempFile, setTempFile] = useState<File | null>(null);

  const handleDrop = async (files: File[]) => {
    const [file] = files;

    setTempFile(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error("Failed to upload logo");
      }
      const { url } = (await uploadResponse.json()) as { url: string };

      const result = await updateOrganization({ logoUrl: url });
      if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Dropzone
      accept={{ "image/*": [] }}
      className="aspect-square"
      maxFiles={1}
      onDrop={handleDrop}
      onError={console.error}
    >
      <DropzoneEmptyState>
        {logoUrl ? (
          <div className="relative size-full">
            <Image
              alt="Preview"
              className="absolute top-0 left-0 h-full w-full object-cover"
              height={102}
              src={logoUrl}
              unoptimized
              width={102}
            />
          </div>
        ) : null}
      </DropzoneEmptyState>
      <DropzoneContent>
        {!!tempFile && (
          <div className="relative size-full">
            <Image
              alt="Preview"
              className="absolute top-0 left-0 h-full w-full object-cover"
              height={102}
              src={URL.createObjectURL(tempFile)}
              unoptimized
              width={102}
            />
          </div>
        )}
      </DropzoneContent>
    </Dropzone>
  );
};
