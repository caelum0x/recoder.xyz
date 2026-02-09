import type { DocumentLoaderErrorCode } from "./types";

/**
 * Get user-friendly error message from DocumentLoaderError
 */
export function getErrorMessage(code: DocumentLoaderErrorCode): string {
	switch (code) {
		case "DOCUMENT_NOT_FOUND":
			return "Repository not found.";
		case "DOCUMENT_RATE_LIMITED":
			return "Rate limited.";
		case "DOCUMENT_TOO_LARGE":
			return "Repository too large.";
		case "DOCUMENT_FETCH_ERROR":
			return "Repository error.";
		default:
			return "Repository error.";
	}
}
