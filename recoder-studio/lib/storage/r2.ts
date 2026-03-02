import "server-only";
import { Readable } from "node:stream";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

type UploadObjectInput = {
	bucket: string;
	key: string;
	body: Buffer | Uint8Array | string;
	contentType?: string;
	upsert?: boolean;
};

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env: ${name}`);
	}
	return value;
}

function getClient(): S3Client {
	const endpoint = requireEnv("R2_ENDPOINT");
	const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
	const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
	const region = process.env.R2_REGION ?? "auto";

	return new S3Client({
		endpoint,
		region,
		credentials: { accessKeyId, secretAccessKey },
		forcePathStyle: true,
	});
}

function normalizeKey(key: string): string {
	return key.replace(/^\/+/, "");
}

function toPathUrl(base: string, path: string) {
	const normalizedBase = base.replace(/\/+$/, "");
	const normalizedPath = path
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `${normalizedBase}/${normalizedPath}`;
}

function toReadable(body: unknown): Readable | null {
	if (body instanceof Readable) {
		return body;
	}
	return null;
}

async function readBodyToBuffer(body: unknown): Promise<Buffer> {
	const asReadable = toReadable(body);
	if (!asReadable) {
		throw new Error("Storage response body is not readable");
	}
	const chunks: Buffer[] = [];
	for await (const chunk of asReadable) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

export async function storageUploadObject(input: UploadObjectInput) {
	const bucket = input.bucket;
	const key = normalizeKey(input.key);
	await getClient().send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: input.body,
			ContentType: input.contentType,
			CacheControl: input.upsert ? "public, max-age=31536000" : undefined,
		}),
	);
	return { key };
}

export async function storageDeleteObjects(bucket: string, keys: string[]) {
	for (const key of keys) {
		const normalizedKey = normalizeKey(key);
		await getClient().send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: normalizedKey,
			}),
		);
	}
}

export async function storageDownloadObject(bucket: string, key: string) {
	const normalizedKey = normalizeKey(key);
	try {
		const response = await getClient().send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: normalizedKey,
			}),
		);
		if (!response.Body) {
			return null;
		}
		return await readBodyToBuffer(response.Body);
	} catch (error) {
		if (error && typeof error === "object" && "$metadata" in error) {
			const metadata = error.$metadata as { httpStatusCode?: number };
			if (metadata.httpStatusCode === 404 || metadata.httpStatusCode === 403) {
				return null;
			}
		}
		throw error;
	}
}

export function storagePublicUrl(bucket: string, key: string) {
	const base = process.env.R2_PUBLIC_BASE_URL ?? process.env.STORAGE_PUBLIC_BASE_URL;
	if (!base) {
		throw new Error("Missing required env: R2_PUBLIC_BASE_URL");
	}
	const normalizedKey = normalizeKey(key);
	if (base.includes("{bucket}")) {
		return toPathUrl(base.replace("{bucket}", bucket), normalizedKey);
	}
	const includesBucket = process.env.R2_PUBLIC_BASE_INCLUDES_BUCKET === "true";
	if (includesBucket) {
		return toPathUrl(base, normalizedKey);
	}
	return toPathUrl(base, `${bucket}/${normalizedKey}`);
}
