import type { IncomingMessage } from "node:http";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

export const readBody = async (req: IncomingMessage): Promise<Buffer> => {
	const chunks: Buffer[] = [];
	let totalSize = 0;

	return await new Promise((resolve, reject) => {
		req.on("data", (chunk: Buffer) => {
			totalSize += chunk.length;
			if (totalSize > MAX_BODY_SIZE) {
				req.destroy();
				reject(new Error("BODY_TOO_LARGE"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
};

export const headersToRecord = (
	headers: IncomingMessage["headers"],
): Record<string, string | undefined> =>
	Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [
			key,
			Array.isArray(value) ? value.join(",") : value,
		]),
	);
