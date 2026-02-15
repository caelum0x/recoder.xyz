export class RecoderStudioSdkError extends Error {
	name = "RecoderStudioSdkError";
}

// Backward compatibility alias for existing consumers.
export class GiselleSdkError extends RecoderStudioSdkError {
	name = "GiselleSdkError";
}

export class ConfigurationError extends RecoderStudioSdkError {
	name = "ConfigurationError";
}

export class ApiError extends RecoderStudioSdkError {
	name = "ApiError";

	constructor(
		message: string,
		public readonly status: number,
		public readonly responseText: string,
	) {
		super(message);
	}
}

export class UnsupportedFeatureError extends RecoderStudioSdkError {
	name = "UnsupportedFeatureError";
}

export class NotImplementedError extends RecoderStudioSdkError {
	name = "NotImplementedError";
}

export class TimeoutError extends RecoderStudioSdkError {
	name = "TimeoutError";
}
