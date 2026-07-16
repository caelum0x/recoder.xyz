import { NextRequest, NextResponse } from "next/server";
import { SURFACE_ORIGINS } from "@recoder/auth/edge";

const ALLOWED_ORIGINS = [
  ...Object.values(SURFACE_ORIGINS),
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3004",
  "http://localhost:3005",
  "http://localhost:3007",
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".recoder.xyz");
}

/**
 * Add CORS headers to a response for cross-subdomain requests.
 */
export function addCorsHeaders(response: Response, request: NextRequest): Response {
  const origin = request.headers.get("origin") || "";
  if (!origin || !isAllowedOrigin(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle OPTIONS preflight for cross-subdomain requests.
 */
export function handlePreflight(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };

  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return new NextResponse(null, { status: 204, headers });
}
