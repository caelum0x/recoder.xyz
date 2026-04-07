"use strict";
/**
 * @module nats-event-bus
 *
 * NATS JetStream-backed event bus for A2A real-time messaging.
 *
 * Replaces Redis pub/sub for event fan-out while keeping Redis for:
 *   - persistent task state (SETNX claim/lock)
 *   - scratchpad KV
 *   - ownership cache
 *
 * Streams:
 *   A2A_TASKS   — task lifecycle events (created, assigned, completed, failed)
 *   A2A_EVENTS  — real-time agent events (heartbeat, status, canvas updates)
 *   A2A_MEMORY  — memory store change events (remember, forget)
 *
 * Usage:
 *   const bus = await createNatsEventBus();
 *   bus.publish('A2A_TASKS', 'task.created', payload);
 *   const sub = bus.subscribe('A2A_EVENTS', 'agent.heartbeat', handler);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNatsEventBus = createNatsEventBus;
const logger_js_1 = require("../logger.js");
const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
// Stream configuration
const STREAMS = {
    A2A_TASKS: { subjects: ['task.>'], maxAge: 24 * 60 * 60 * 1_000_000_000 }, // 24h retention in ns
    A2A_EVENTS: { subjects: ['agent.>'], maxAge: 1 * 60 * 60 * 1_000_000_000 }, // 1h retention
    A2A_MEMORY: { subjects: ['memory.>'], maxAge: 7 * 24 * 60 * 60 * 1_000_000_000 }, // 7d retention
};
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Create a NATS JetStream event bus.
 * Lazily imports the `nats` package to avoid hard dependency.
 * Falls back to no-op bus if `nats` is not installed or unreachable.
 */
async function createNatsEventBus() {
    let natsLib;
    try {
        // Dynamic import — nats may not be installed yet
        natsLib = await Function('return import("nats")')();
    }
    catch {
        logger_js_1.logger.warn('[nats-event-bus] nats package not installed — using no-op event bus');
        return createNoopBus();
    }
    let nc;
    let js;
    let connected = false;
    try {
        nc = await natsLib.connect({ servers: NATS_URL });
        connected = true;
        logger_js_1.logger.info({ url: NATS_URL }, '[nats-event-bus] Connected');
        js = nc.jetstream();
        const jsm = await nc.jetstreamManager();
        // Ensure streams exist
        for (const [name, config] of Object.entries(STREAMS)) {
            try {
                await jsm.streams.info(name);
            }
            catch {
                await jsm.streams.add({
                    name,
                    subjects: config.subjects,
                    max_age: config.maxAge,
                    storage: 'file',
                    retention: 'limits',
                    discard: 'old',
                });
                logger_js_1.logger.info({ name }, '[nats-event-bus] Created JetStream stream');
            }
        }
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, '[nats-event-bus] Failed to connect — using no-op event bus');
        return createNoopBus();
    }
    const codec = natsLib.JSONCodec();
    return {
        async publish(_stream, subject, data) {
            if (!connected)
                return;
            try {
                await js.publish(subject, codec.encode(data));
            }
            catch (err) {
                logger_js_1.logger.warn({ err, subject }, '[nats-event-bus] Publish failed');
            }
        },
        async subscribe(_stream, subject, handler) {
            if (!connected)
                return { subject, unsubscribe: () => { } };
            const sub = nc.subscribe(subject);
            // Process messages in background
            (async () => {
                for await (const msg of sub) {
                    try {
                        const decoded = codec.decode(msg.data);
                        await handler(decoded, msg.subject);
                    }
                    catch (err) {
                        logger_js_1.logger.warn({ err, subject }, '[nats-event-bus] Handler error');
                    }
                }
            })().catch(() => { });
            return {
                subject,
                unsubscribe: () => { sub.unsubscribe(); },
            };
        },
        async close() {
            if (!connected)
                return;
            connected = false;
            try {
                await nc.drain();
                logger_js_1.logger.info('[nats-event-bus] Disconnected');
            }
            catch {
                // Best effort
            }
        },
        isConnected() {
            return connected;
        },
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
/** No-op bus for when NATS is not available. */
function createNoopBus() {
    return {
        async publish() { },
        async subscribe(_s, subject) {
            return { subject, unsubscribe: () => { } };
        },
        async close() { },
        isConnected() { return false; },
    };
}
