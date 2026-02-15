import type { IncomingMessage, ServerResponse } from "node:http";
import { getConnector } from "../connectors/registry.js";
import type { ProviderId } from "../connectors/types.js";
import { dispatchNormalizedMessages } from "../dispatch.js";
import { headersToRecord, readBody } from "../http.js";
import { logger } from "../logger.js";

export const handleWebhook = async (
	provider: ProviderId,
	req: IncomingMessage,
	res: ServerResponse,
	requestId?: string,
) => {
	const connector = getConnector(provider);
	const config = connector.describeConfig();

	if (config.status !== "ready") {
		res.writeHead(501, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: false,
				error: "connector_not_configured",
				message: config.reason,
			}),
		);
		return;
	}

	const rawBody = await readBody(req);
	const headers = headersToRecord(req.headers);
	const signatureOk = await connector.verifySignature({ rawBody, headers });

	if (!signatureOk) {
		res.writeHead(401, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: false,
				error: "invalid_signature",
			}),
		);
		return;
	}

	const result = await connector.parseEvent({ rawBody, headers });

	if (result.immediateResponse) {
		res.writeHead(result.immediateResponse.status, {
			"content-type": "application/json",
			...result.immediateResponse.headers,
		});
		res.end(result.immediateResponse.body);
		return;
	}

	const reqLogger = requestId ? logger.child({ requestId }) : logger;
	if (result.event) {
		reqLogger.info({ provider, event: result.event }, "Webhook accepted");
	}
	if (result.normalizedMessages?.length) {
		await dispatchNormalizedMessages(result.normalizedMessages, requestId);
	}

	res.writeHead(202, { "content-type": "application/json" });
	res.end(JSON.stringify({ ok: true }));
};
