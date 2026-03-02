declare module "@recoder/*";
declare module "@recoder-internal/*";

declare module "lucide-react/dynamic" {
	export type IconName = string;
}

declare module "next/server" {
	export function after(task: () => void | Promise<void>): void;
	export interface NextURL extends URL {
		clone(): NextURL;
	}
	export interface NextRequest extends Request {
		nextUrl: NextURL;
		cookies: {
			getAll(): Array<{ name: string; value: string }>;
			get(name: string): { name: string; value: string } | undefined;
			set(name: string, value: string): void;
		};
	}
	export class NextResponse extends Response {
		cookies: {
			set(name: string, value: string, options?: unknown): void;
		};
		static redirect(
			url: string | URL,
			init?: number | ResponseInit,
		): NextResponse;
		static rewrite(url: string | URL, init?: ResponseInit): NextResponse;
		static next(init?: { request?: Request; headers?: HeadersInit }): NextResponse;
	}
}

declare module "next/server.js" {
	export function after(task: () => void | Promise<void>): void;
	export interface NextURL extends URL {
		clone(): NextURL;
	}
	export interface NextRequest extends Request {
		nextUrl: NextURL;
		cookies: {
			getAll(): Array<{ name: string; value: string }>;
			get(name: string): { name: string; value: string } | undefined;
			set(name: string, value: string): void;
		};
	}
	export class NextResponse extends Response {
		cookies: {
			set(name: string, value: string, options?: unknown): void;
		};
		static redirect(
			url: string | URL,
			init?: number | ResponseInit,
		): NextResponse;
		static rewrite(url: string | URL, init?: ResponseInit): NextResponse;
		static next(init?: { request?: Request; headers?: HeadersInit }): NextResponse;
	}
}

declare module "ai" {
	export type ModelMessage = unknown;
	export type ProviderMetadata = Record<string, unknown>;
	export type UIMessage = unknown;
	export function createUIMessageStream(...args: unknown[]): unknown;
	export function readUIMessageStream(...args: unknown[]): unknown;
}
