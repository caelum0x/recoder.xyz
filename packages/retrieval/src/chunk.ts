/**
 * chunk — turn a document (raw text OR a file path) into ordered passages the
 * engine can embed. A thin wrapper: PDFs go through `@recoder/document-preprocessor`
 * (dynamically imported so the pdfium wasm surface is never loaded unless needed,
 * and its absence degrades to a raw read); everything else is read as UTF-8. The
 * actual splitting (`chunkText`) is dependency-free — blank-line paragraphs, with
 * long paragraphs hard-split by a character budget.
 *
 * DEGRADE-SAFE: an unreadable path, a PDF extractor that is missing or throws, or
 * empty content all resolve to `[]` (no chunks) rather than throwing. The engine
 * reports an "empty" ingest truthfully.
 */

export interface Chunk {
	/** The passage text. */
	text: string;
	/** 0-based position of this chunk within the source document. */
	index: number;
}

export interface ChunkOptions {
	/** Hard upper bound on characters per chunk. Default 1200. */
	maxChars?: number;
	/** Drop chunks shorter than this after trimming. Default 1. */
	minChars?: number;
}

export interface ChunkInput {
	/** Inline document text. Takes precedence over `path` when both are given. */
	text?: string;
	/** Filesystem path to read (PDF via document-preprocessor, else UTF-8). */
	path?: string;
}

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_MIN_CHARS = 1;

/**
 * Split raw text into ordered chunks. Splits first on blank-line boundaries
 * (paragraphs), then hard-splits any paragraph longer than `maxChars` so no
 * single chunk blows the embedding context. Pure + synchronous — the always
 * available fallback.
 */
export function chunkText(raw: string, options: ChunkOptions = {}): Chunk[] {
	const maxChars = normalizePositive(options.maxChars, DEFAULT_MAX_CHARS);
	const minChars = normalizePositive(options.minChars, DEFAULT_MIN_CHARS);
	if (typeof raw !== "string" || raw.trim().length === 0) {
		return [];
	}

	const paragraphs = raw
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const pieces: string[] = [];
	for (const paragraph of paragraphs) {
		if (paragraph.length <= maxChars) {
			pieces.push(paragraph);
			continue;
		}
		for (const slice of hardSplit(paragraph, maxChars)) {
			pieces.push(slice);
		}
	}

	const chunks: Chunk[] = [];
	for (const piece of pieces) {
		const text = piece.trim();
		if (text.length >= minChars) {
			chunks.push({ text, index: chunks.length });
		}
	}
	return chunks;
}

/**
 * Resolve a `ChunkInput` to ordered chunks. Reads the path when no inline text
 * is supplied. Never throws: any load failure resolves to `[]`.
 */
export async function chunkDocument(
	input: ChunkInput,
	options: ChunkOptions = {},
): Promise<Chunk[]> {
	const text =
		typeof input.text === "string" && input.text.length > 0
			? input.text
			: input.path
				? await loadText(input.path)
				: "";
	return chunkText(text, options);
}

/** Hard-split an over-long string into <= maxChars slices, preferring whitespace. */
function hardSplit(text: string, maxChars: number): string[] {
	const slices: string[] = [];
	let remaining = text;
	while (remaining.length > maxChars) {
		let cut = remaining.lastIndexOf(" ", maxChars);
		// No whitespace to break on within the window ⇒ hard cut at the budget.
		if (cut <= 0) {
			cut = maxChars;
		}
		slices.push(remaining.slice(0, cut).trim());
		remaining = remaining.slice(cut).trim();
	}
	if (remaining.length > 0) {
		slices.push(remaining);
	}
	return slices;
}

/**
 * Read a document to text. PDFs are extracted via document-preprocessor (dynamic
 * import — degrade to a raw read if unavailable / on error); other files are read
 * as UTF-8. Any failure resolves to an empty string (degrade-safe).
 */
async function loadText(path: string): Promise<string> {
	let readFile: (typeof import("node:fs/promises"))["readFile"];
	try {
		({ readFile } = await import("node:fs/promises"));
	} catch {
		return "";
	}

	if (path.toLowerCase().endsWith(".pdf")) {
		try {
			const buffer = await readFile(path);
			const dp = (await import("@recoder/document-preprocessor")) as {
				extractPdfText?: (
					data: unknown,
				) => Promise<{ pages?: Array<{ text?: unknown }> }>;
			};
			if (typeof dp.extractPdfText === "function") {
				const result = await dp.extractPdfText(buffer);
				const text = (result?.pages ?? [])
					.map((page) => (typeof page?.text === "string" ? page.text : ""))
					.join("\n\n")
					.trim();
				if (text.length > 0) {
					return text;
				}
			}
		} catch {
			// Fall through to a raw read below.
		}
	}

	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

function normalizePositive(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}
