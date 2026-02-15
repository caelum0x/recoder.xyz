/**
 * Ambient type declaration for @giselles-ai/rag
 * The package source exists at packages/rag but dist/ is not built.
 * These minimal types satisfy the github-tool imports.
 */
declare module '@giselles-ai/rag' {
  export interface Document<TMetadata extends Record<string, unknown> = Record<string, never>> {
    content: string;
    metadata: TMetadata;
  }

  export interface DocumentLoader<TMetadata extends Record<string, unknown> = Record<string, never>> {
    loadMetadata(): AsyncIterable<TMetadata>;
    loadDocument(metadata: TMetadata): Promise<Document<TMetadata> | null>;
  }

  export class DocumentLoaderError extends Error {
    readonly code: string;
    readonly category: 'document-loader';
    readonly context?: Record<string, unknown>;
    readonly cause?: Error;

    static notFound(resourcePath: string, cause?: Error, context?: Record<string, unknown>): DocumentLoaderError;
    static fetchError(source: string, operation: string, cause?: Error, context?: Record<string, unknown>): DocumentLoaderError;
    static rateLimited(source: string, retryAfter: string | number | undefined, cause?: Error, context?: Record<string, unknown>): DocumentLoaderError;
    static tooLarge(resourcePath: string, size: number, maxSize: number, cause?: Error, context?: Record<string, unknown>): DocumentLoaderError;

    getRetryAfterDate(): Date | undefined;
  }
}
