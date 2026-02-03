/**
 * Symbol used for identifying Error instances.
 * Enables checking if an error is an instance of GitHubError across package versions.
 */
const marker = "github.error";
const symbol = Symbol.for(marker);

/**
 * Custom error class for GitHub related errors.
 * @extends Error
 */
export class GitHubError extends Error {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The underlying cause of the error, if any.
   */
  readonly cause?: unknown;

  /**
   * Creates a GitHub Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name,
    message,
    cause,
  }: {
    name: string;
    message: string;
    cause?: unknown;
  }) {
    super(message);

    this.name = name;
    this.cause = cause;
  }

  /**
   * Checks if the given error is a GitHub Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is a GitHub Error, false otherwise.
   */
  static isInstance(error: unknown): error is GitHubError {
    return GitHubError.hasMarker(error, marker);
  }

  protected static hasMarker(error: unknown, marker: string): boolean {
    const markerSymbol = Symbol.for(marker);
    return (
      error != null &&
      typeof error === "object" &&
      markerSymbol in error &&
      typeof error[markerSymbol] === "boolean" &&
      error[markerSymbol] === true
    );
  }
}

/**
 * Symbol used for identifying Webhook Unauthorized Error instances.
 */
const webhookUnauthorizedMarker = "github.webhook.unauthorized.error";
const webhookUnauthorizedSymbol = Symbol.for(webhookUnauthorizedMarker);

/**
 * Custom error class for GitHub Webhook Unauthorized related errors.
 * @extends GitHubError
 */
export class GitHubWebhookUnauthorizedError extends GitHubError {
  private readonly [webhookUnauthorizedSymbol] = true; // used in isInstance

  /**
   * Creates a GitHub Webhook Unauthorized Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor(args?: { message?: string; cause?: unknown }) {
    super({
      name: "GitHubWebhookUnauthorizedError",
      message: args?.message ?? "GitHub error",
      cause: args?.cause,
    });
  }

  /**
   * Checks if the given error is a GitHub Webhook Unauthorized Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is a GitHub Webhook Unauthorized Error, false otherwise.
   */
  static isInstance(error: unknown): error is GitHubWebhookUnauthorizedError {
    return GitHubError.hasMarker(error, webhookUnauthorizedMarker);
  }
}

/**
 * Symbol used for identifying Not Found Error instances.
 */
const notFoundMarker = "github.notfound.error";
const notFoundSymbol = Symbol.for(notFoundMarker);

/**
 * Custom error class for GitHub Not Found related errors.
 * @extends GitHubError
 */
export class GitHubNotFoundError extends GitHubError {
  private readonly [notFoundSymbol] = true; // used in isInstance

  readonly resource: string;

  constructor(args: { resource: string; message?: string; cause?: unknown }) {
    super({
      name: "GitHubNotFoundError",
      message: args.message ?? `Resource not found: ${args.resource}`,
      cause: args.cause,
    });
    this.resource = args.resource;
  }

  static isInstance(error: unknown): error is GitHubNotFoundError {
    return GitHubError.hasMarker(error, notFoundMarker);
  }
}

/**
 * Symbol used for identifying Rate Limit Error instances.
 */
const rateLimitMarker = "github.ratelimit.error";
const rateLimitSymbol = Symbol.for(rateLimitMarker);

/**
 * Custom error class for GitHub Rate Limit related errors.
 * @extends GitHubError
 */
export class GitHubRateLimitError extends GitHubError {
  private readonly [rateLimitSymbol] = true; // used in isInstance

  readonly retryAfter?: number;

  constructor(args?: {
    message?: string;
    cause?: unknown;
    retryAfter?: number;
  }) {
    super({
      name: "GitHubRateLimitError",
      message: args?.message ?? "Rate limit exceeded",
      cause: args?.cause,
    });
    this.retryAfter = args?.retryAfter;
  }

  static isInstance(error: unknown): error is GitHubRateLimitError {
    return GitHubError.hasMarker(error, rateLimitMarker);
  }
}
