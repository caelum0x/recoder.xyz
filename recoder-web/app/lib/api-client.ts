/**
 * Type-safe API Client
 * Helper functions for making API requests with proper TypeScript types
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Type-safe fetch wrapper
 */
export async function typedFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw new ApiError(
      errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorData
    );
  }

  return response.json() as Promise<T>;
}

/**
 * GET request
 */
export async function get<T>(url: string): Promise<T> {
  return typedFetch<T>(url);
}

/**
 * POST request
 */
export async function post<T>(url: string, body: any): Promise<T> {
  return typedFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PATCH request
 */
export async function patch<T>(url: string, body: any): Promise<T> {
  return typedFetch<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request
 */
export async function del<T>(url: string): Promise<T> {
  return typedFetch<T>(url, {
    method: 'DELETE',
  });
}
