import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { extractPdfText, renderPdfPageImages } from "./pdf";
import { extractText } from "./text";
import type {
	BinaryDataInput,
	PdfImageRenderOptions,
	PdfImageRenderResult,
	PdfTextExtractionOptions,
	PdfTextExtractionResult,
	TextExtractionOptions,
	TextExtractionResult,
} from "./types";

/**
 * Supported document types for text extraction
 */
export type SupportedDocumentType = "pdf" | "text" | "markdown" | "unknown";

/**
 * Options for loading a document
 */
export interface DocumentLoadOptions {
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** For PDF files: password if the document is encrypted */
	password?: string;
	/** For PDF files: maximum number of pages to extract */
	maxPages?: number;
	/** For PDF files: the PDFium WASM binary */
	pdfiumWasmBinary?: ArrayBuffer | ArrayBufferView;
	/** For text files: character encoding (default: utf-8) */
	encoding?: BufferEncoding;
}

/**
 * Result of loading a document
 */
export interface DocumentLoadResult {
	/** The document type that was detected */
	type: SupportedDocumentType;
	/** Extracted text content */
	text: string;
	/** For PDF files: total number of pages */
	totalPages?: number;
	/** For PDF files: per-page text content */
	pages?: Array<{ pageNumber: number; text: string }>;
}

/**
 * Detect document type from file extension
 * @param filePath - Path to the file
 * @returns The detected document type
 */
export function detectDocumentType(filePath: string): SupportedDocumentType {
	const ext = extname(filePath).toLowerCase();
	switch (ext) {
		case ".pdf":
			return "pdf";
		case ".txt":
		case ".text":
			return "text";
		case ".md":
		case ".markdown":
		case ".mdx":
			return "markdown";
		default:
			return "unknown";
	}
}

/**
 * Load and extract text from a file path
 * @param filePath - Path to the document file
 * @param options - Loading options
 * @returns Extracted document content
 */
export async function loadDocumentFromPath(
	filePath: string,
	options: DocumentLoadOptions = {},
): Promise<DocumentLoadResult> {
	const type = detectDocumentType(filePath);
	const data = await readFile(filePath);
	return loadDocument(data, type, options);
}

/**
 * Load and extract text from binary data
 * @param data - Binary document data
 * @param type - Document type (or "unknown" to attempt auto-detection)
 * @param options - Loading options
 * @returns Extracted document content
 */
export async function loadDocument(
	data: BinaryDataInput,
	type: SupportedDocumentType,
	options: DocumentLoadOptions = {},
): Promise<DocumentLoadResult> {
	switch (type) {
		case "pdf":
			return loadPdfDocument(data, options);
		case "text":
		case "markdown":
			return loadTextDocument(data, type, options);
		case "unknown":
			// Try to detect from content (PDF magic bytes)
			if (isPdfData(data)) {
				return loadPdfDocument(data, options);
			}
			// Default to text
			return loadTextDocument(data, "text", options);
	}
}

/**
 * Load PDF document and extract text
 */
async function loadPdfDocument(
	data: BinaryDataInput,
	options: DocumentLoadOptions,
): Promise<DocumentLoadResult> {
	if (!options.pdfiumWasmBinary) {
		throw new Error(
			"pdfiumWasmBinary is required for PDF extraction. " +
				"Load the PDFium WASM binary and pass it in options.",
		);
	}

	const pdfOptions: PdfTextExtractionOptions = {
		pdfiumWasmBinary: options.pdfiumWasmBinary,
		password: options.password,
		maxPages: options.maxPages,
		signal: options.signal,
	};

	const result = await extractPdfText(data, pdfOptions);

	// Combine all page text into a single string
	const text = result.pages.map((p) => p.text).join("\n\n");

	return {
		type: "pdf",
		text,
		totalPages: result.totalPages,
		pages: result.pages,
	};
}

/**
 * Load text/markdown document
 */
function loadTextDocument(
	data: BinaryDataInput,
	type: "text" | "markdown",
	options: DocumentLoadOptions,
): DocumentLoadResult {
	const textOptions: TextExtractionOptions = {
		encoding: options.encoding,
		signal: options.signal,
	};

	const result = extractText(data, textOptions);

	return {
		type,
		text: result.text,
	};
}

/**
 * Check if data appears to be a PDF file (by magic bytes)
 */
function isPdfData(data: BinaryDataInput): boolean {
	// PDF magic bytes: %PDF-
	const pdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d];

	let bytes: Uint8Array;
	if (data instanceof Uint8Array) {
		bytes = data;
	} else if (ArrayBuffer.isView(data)) {
		bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	} else {
		bytes = new Uint8Array(data);
	}

	if (bytes.length < pdfMagic.length) {
		return false;
	}

	return pdfMagic.every((byte, index) => bytes[index] === byte);
}

/**
 * Render PDF pages to images
 * @param data - PDF binary data
 * @param options - Render options
 * @returns Rendered page images
 */
export async function renderPdfImages(
	data: BinaryDataInput,
	options: Omit<PdfImageRenderOptions, "pdfiumWasmBinary"> & {
		pdfiumWasmBinary: ArrayBuffer | ArrayBufferView;
	},
): Promise<PdfImageRenderResult> {
	return renderPdfPageImages(data, options);
}

/**
 * Extract text from PDF data directly
 * @param data - PDF binary data
 * @param options - Extraction options
 * @returns Extracted PDF text
 */
export async function extractPdfTextDirect(
	data: BinaryDataInput,
	options: PdfTextExtractionOptions,
): Promise<PdfTextExtractionResult> {
	return extractPdfText(data, options);
}

/**
 * Extract text from plain text/markdown data directly
 * @param data - Text binary data
 * @param options - Extraction options
 * @returns Extracted text
 */
export function extractTextDirect(
	data: BinaryDataInput,
	options?: TextExtractionOptions,
): TextExtractionResult {
	return extractText(data, options);
}
