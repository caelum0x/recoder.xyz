import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

const STORAGE_DIR = process.env.AGENCY_STORAGE_DIR || "/root/recoder.xyz/data/agency-storage";
const PUBLIC_URL_BASE = process.env.AGENCY_STORAGE_PUBLIC_URL || "https://agency.recoder.xyz/api/storage";

/**
 * Local filesystem storage that replaces Supabase Storage.
 * Files are stored on disk and served via a local API route.
 *
 * Falls back to Supabase if SUPABASE_URL is configured and not a placeholder.
 */
function isSupabaseConfigured(): boolean {
	const url = process.env.SUPABASE_URL || "";
	return url.length > 0 && !url.includes("placeholder");
}

function ensureDir(filePath: string) {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

export interface LocalStorageBucket {
	upload(path: string, data: Buffer, options?: { contentType?: string; upsert?: boolean }): Promise<{ data: { path: string } | null; error: Error | null }>;
	download(path: string): Promise<{ data: Blob | null; error: Error | null }>;
	getPublicUrl(path: string): { data: { publicUrl: string } };
	remove(paths: string[]): Promise<{ data: null; error: Error | null }>;
}

function createLocalStorage(): LocalStorageBucket {
	return {
		async upload(path: string, data: Buffer, _options?: { contentType?: string; upsert?: boolean }) {
			try {
				const fullPath = join(STORAGE_DIR, path);
				ensureDir(fullPath);
				writeFileSync(fullPath, data);
				return { data: { path }, error: null };
			} catch (err) {
				return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
			}
		},
		async download(path: string) {
			try {
				const fullPath = join(STORAGE_DIR, path);
				if (!existsSync(fullPath)) {
					return { data: null, error: new Error(`File not found: ${path}`) };
				}
				const buffer = readFileSync(fullPath);
				return { data: new Blob([buffer]), error: null };
			} catch (err) {
				return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
			}
		},
		getPublicUrl(path: string) {
			return { data: { publicUrl: `${PUBLIC_URL_BASE}/${path}` } };
		},
		async remove(paths: string[]) {
			try {
				for (const p of paths) {
					const fullPath = join(STORAGE_DIR, p);
					if (existsSync(fullPath)) {
						unlinkSync(fullPath);
					}
				}
				return { data: null, error: null };
			} catch (err) {
				return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
			}
		},
	};
}

export function appStorage(): LocalStorageBucket {
	if (isSupabaseConfigured()) {
		// Use Supabase if properly configured
		const { createClient } = require("@supabase/supabase-js");
		const supabaseClient = createClient(
			process.env.SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_KEY!,
			{},
		);
		return supabaseClient.storage.from("public-assets");
	}

	// Use local filesystem storage
	return createLocalStorage();
}
