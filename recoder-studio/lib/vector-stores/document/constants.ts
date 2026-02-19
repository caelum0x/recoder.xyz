export const DOCUMENT_VECTOR_STORE_MAX_FILE_SIZE_MB = 4.5;
export const DOCUMENT_VECTOR_STORE_MAX_FILE_SIZE_BYTES = Math.floor(
	DOCUMENT_VECTOR_STORE_MAX_FILE_SIZE_MB * 1024 * 1024,
);
export const DOCUMENT_VECTOR_STORE_MAX_FILE_SIZE_LABEL = `${DOCUMENT_VECTOR_STORE_MAX_FILE_SIZE_MB}MB`;

export const DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES = [
	{
		extension: ".pdf",
		mimeTypes: ["application/pdf"],
	},
	{
		extension: ".txt",
		mimeTypes: ["text/plain"],
	},
	{
		extension: ".md",
		mimeTypes: ["text/markdown", "text/x-markdown"],
	},
] as const;

export const DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_EXTENSIONS =
	DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES.map(
		(fileType) => fileType.extension,
	);

export const DOCUMENT_VECTOR_STORE_SUPPORTED_MIME_TYPES =
	DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPES.flatMap(
		(fileType) => fileType.mimeTypes,
	);

export const DOCUMENT_VECTOR_STORE_SUPPORTED_FILE_TYPE_LABEL =
	"PDF, TXT, or Markdown (.md)";
