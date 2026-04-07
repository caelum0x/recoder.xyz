"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeTaskStreamEvent = serializeTaskStreamEvent;
const public_task_stream_1 = require("@recoder/stream/public-task-stream");
function serializeTaskStreamEvent(event, options) {
    return (0, public_task_stream_1.serializePublicTaskStreamEvent)(event, options);
}
