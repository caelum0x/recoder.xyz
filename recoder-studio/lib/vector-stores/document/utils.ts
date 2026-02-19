import { DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES } from "./constants";

type SupportedDocumentFileType =
	(typeof DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES)[number];

function findSupportedFileTypeByMimeType(
	mimeType: string | undefined,
): SupportedDocumentFileType | null {
	if (!mimeType) {
		return null;
	}
	const normalizedMimeType = mimeType.toLowerCase();
	return (
		DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES.find((fileType) =>
			fileType.mimeTypes.some(
				(supportedMime) => supportedMime.toLowerCase() === normalizedMimeType,
			),
		) ?? null
	);
}

function findSupportedFileTypeByExtension(
	fileName: string,
): SupportedDocumentFileType | null {
	const lowerFileName = fileName.toLowerCase();
	return (
		DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES.find((fileType) =>
			lowerFileName.endsWith(fileType.extension),
		) ?? null
	);
}

export function resolveSupportedDocumentFile(file: {
	type?: string;
	name: string;
}): { extension: string; contentType: string } | null {
	const matchedByExtension = findSupportedFileTypeByExtension(file.name);
	if (matchedByExtension) {
		const normalizedMime = file.type?.toLowerCase();
		const matchedMime =
			normalizedMime &&
			matchedByExtension.mimeTypes.find(
				(mime) => mime.toLowerCase() === normalizedMime,
			);

		return {
			extension: matchedByExtension.extension,
			contentType: matchedMime ?? matchedByExtension.mimeTypes[0],
		};
	}

	const matchedByMimeType = findSupportedFileTypeByMimeType(file.type);
	if (matchedByMimeType) {
		return {
			extension: matchedByMimeType.extension,
			contentType:
				file.type && file.type.length > 0
					? file.type
					: matchedByMimeType.mimeTypes[0],
		};
	}

	return null;
}

export function isSupportedDocumentFile(file: {
	type?: string;
	name: string;
}): boolean {
	return resolveSupportedDocumentFile(file) !== null;
}

export function sanitizeDocumentFileName(
	fileName: string,
	extension: string,
): string {
	const trimmed = fileName.trim();
	const normalizedExtension = extension.startsWith(".")
		? extension
		: `.${extension}`;
	const lowerTrimmed = trimmed.toLowerCase();
	const extensionLower = normalizedExtension.toLowerCase();
	const base = lowerTrimmed.endsWith(extensionLower)
		? trimmed.slice(0, -normalizedExtension.length)
		: trimmed;
	const sanitizedBase = base
		.replace(/[^a-z0-9-_]+/gi, "_")
		.replace(/_{2,}/g, "_");
	const finalBase = sanitizedBase.length > 0 ? sanitizedBase : "document";
	return `${finalBase}${normalizedExtension}`;
}
