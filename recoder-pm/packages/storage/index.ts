import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const getConfig = () => ({
  endpoint: process.env.S3_ENDPOINT ?? "",
  bucket: process.env.S3_BUCKET ?? "",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  publicUrl: process.env.S3_PUBLIC_URL ?? "",
  region: process.env.S3_REGION ?? "auto",
});

const getClient = () => {
  const config = getConfig();

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
};

/**
 * Upload a file to S3-compatible storage and return its public URL.
 */
export const uploadFile = async (
  file: Buffer,
  key: string,
  contentType: string
): Promise<string> => {
  const config = getConfig();
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return getPublicUrl(key);
};

/**
 * Get the public URL for a given storage key.
 */
export const getPublicUrl = (key: string): string => {
  const config = getConfig();

  return `${config.publicUrl}/${key}`;
};

/**
 * Delete a file from S3-compatible storage.
 */
export const deleteFile = async (key: string): Promise<void> => {
  const config = getConfig();
  const client = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );
};

/**
 * Generate a presigned URL for client-side uploads.
 */
export const generatePresignedUploadUrl = (
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> => {
  const config = getConfig();
  const client = getClient();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
};
