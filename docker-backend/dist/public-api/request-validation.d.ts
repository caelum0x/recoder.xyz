export declare class RequestValidationError extends Error {
    code: string;
    details?: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
export declare function requireNonEmptyString(value: unknown, field: string, code?: string): string;
export declare function optionalString(value: unknown): string | undefined;
export declare function parseRouteIds(params: Record<string, string | undefined>): {
    id: string;
    taskId?: string;
};
