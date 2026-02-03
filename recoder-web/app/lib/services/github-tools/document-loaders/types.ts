/**
 * Document loader types for GitHub repositories
 */

/**
 * A document loaded from a source with metadata
 */
export interface Document<TMetadata = unknown> {
  content: string;
  metadata: TMetadata;
}

/**
 * A document loader that can iterate over documents
 */
export interface DocumentLoader<TMetadata = unknown> {
  loadMetadata(): AsyncIterable<TMetadata>;
  loadDocument(metadata: TMetadata): Promise<Document<TMetadata> | null>;
}

/**
 * Error types for document loading
 */
export class DocumentLoaderError extends Error {
  readonly errorType: string;
  readonly details: Record<string, unknown>;

  constructor(
    errorType: string,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "DocumentLoaderError";
    this.errorType = errorType;
    this.details = details;
  }

  static notFound(
    resource: string,
    cause?: unknown,
    details: Record<string, unknown> = {}
  ): DocumentLoaderError {
    return new DocumentLoaderError(
      "NOT_FOUND",
      `Resource not found: ${resource}`,
      { ...details, resource, cause }
    );
  }

  static fetchError(
    source: string,
    operation: string,
    cause?: unknown,
    details: Record<string, unknown> = {}
  ): DocumentLoaderError {
    return new DocumentLoaderError(
      "FETCH_ERROR",
      `Failed to fetch from ${source}: ${operation}`,
      { ...details, source, operation, cause }
    );
  }

  static rateLimited(
    source: string,
    retryAfter?: string,
    cause?: unknown,
    details: Record<string, unknown> = {}
  ): DocumentLoaderError {
    return new DocumentLoaderError(
      "RATE_LIMITED",
      `Rate limited by ${source}${retryAfter ? `, retry after ${retryAfter}` : ""}`,
      { ...details, source, retryAfter, cause }
    );
  }

  static tooLarge(
    resource: string,
    size: number,
    limit: number,
    cause?: unknown,
    details: Record<string, unknown> = {}
  ): DocumentLoaderError {
    return new DocumentLoaderError(
      "TOO_LARGE",
      `Resource ${resource} is too large: ${size} exceeds limit of ${limit}`,
      { ...details, resource, size, limit, cause }
    );
  }
}

/**
 * Helper to replace null characters in content
 */
export function replaceNullCharacters(content: string): string {
  return content.replace(/\0/g, "");
}
