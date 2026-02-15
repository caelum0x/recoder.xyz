import { currentUser } from "@repo/backend/auth/utils";
import { uploadFile } from "@repo/storage";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const POST = async (request: Request): Promise<Response> => {
  const user = await currentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file && file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds 20MB limit" },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split("/").pop() ?? "bin";
  const key = `uploads/${nanoid(36)}.${extension}`;
  const contentType = file.type || "application/octet-stream";

  const url = await uploadFile(buffer, key, contentType);

  return NextResponse.json({ url });
};
