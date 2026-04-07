"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePublicTaskStreamEvent = serializePublicTaskStreamEvent;
function serializePublicTaskStreamEvent(event, options) {
    const parts = [];
    if (options?.id) {
        parts.push(`id: ${options.id}`);
    }
    parts.push(`event: ${options?.event || event.type}`);
    if (typeof options?.retry === 'number' && Number.isFinite(options.retry) && options.retry >= 0) {
        parts.push(`retry: ${Math.floor(options.retry)}`);
    }
    parts.push(`data: ${JSON.stringify(event)}`);
    return `${parts.join('\n')}\n\n`;
}
