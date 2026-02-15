declare module "@giselles-ai/*";
declare module "@giselle-internal/*";

declare module "lucide-react/dynamic" {
	export type IconName = string;
}

declare module "next/server" {
	export function after(task: () => void | Promise<void>): void;
}

declare module "next/server.js" {
	export function after(task: () => void | Promise<void>): void;
}

declare module "ai" {
	export type ModelMessage = unknown;
	export type ProviderMetadata = Record<string, unknown>;
	export type UIMessage = unknown;
	export function createUIMessageStream(...args: unknown[]): unknown;
	export function readUIMessageStream(...args: unknown[]): unknown;
}
