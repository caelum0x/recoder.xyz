/**
 * A type-safe extension of the standard Response class
 * specifically designed for JSON responses with proper typing.
 */
export class JsonResponse<T> extends Response {
	readonly data: T;

	private static normalizeHeaders(initHeaders?: HeadersInit): Record<string, string> {
		if (!initHeaders) return {};
		if (initHeaders instanceof Headers) {
			return Object.fromEntries(initHeaders.entries());
		}
		if (Array.isArray(initHeaders)) {
			return Object.fromEntries(initHeaders);
		}
		return { ...initHeaders };
	}

	constructor(body: T, init?: ResponseInit) {
		// Serialize the body to JSON if it's not already a string or buffer
		const serializedBody =
			typeof body === "string" ||
			body instanceof ArrayBuffer ||
			body instanceof ReadableStream
				? body
				: JSON.stringify(body);

		super(serializedBody, {
			...init,
			headers: {
				...JsonResponse.normalizeHeaders(init?.headers),
				"Content-Type": "application/json",
			},
		});

		// Store the typed data for easy access
		this.data = body;
	}

	/**
	 * Create a JsonResponse with a JSON payload
	 */
	static json<U>(data: U, init?: ResponseInit): JsonResponse<U> {
		return new JsonResponse<U>(data, init);
	}
}
