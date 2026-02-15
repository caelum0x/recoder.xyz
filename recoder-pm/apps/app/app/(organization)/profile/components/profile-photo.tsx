"use client";

import type { User } from "@repo/backend/auth";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@repo/design-system/components/kibo-ui/dropzone";
import { handleError } from "@repo/design-system/lib/handle-error";
import Image from "next/image";
import { useState } from "react";
import { updateProfileImage } from "@/actions/users/update-image";

type ProfilePhotoProps = {
  userId: User["id"];
  avatarUrl: string | null;
};

export const ProfilePhoto = ({
  userId: _userId,
  avatarUrl,
}: ProfilePhotoProps) => {
  const [tempFile, setTempFile] = useState<File | null>(null);

  const handleDrop = async (files: File[]) => {
    try {
      const [file] = files;

      setTempFile(file);

      const formData = new FormData();
      formData.append("file", file);
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) {
        throw new Error("Failed to upload profile photo");
      }
      const { url } = (await uploadResponse.json()) as { url: string };

      const result = await updateProfileImage(url);
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
        {avatarUrl ? (
          <div className="relative size-full">
            <Image
              alt="Preview"
              className="absolute top-0 left-0 h-full w-full object-cover"
              height={102}
              src={avatarUrl}
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
