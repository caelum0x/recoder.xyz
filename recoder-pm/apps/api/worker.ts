import { createServer } from "node:http";
import { initializeSentry } from "@repo/observability/instrumentation";
import { log } from "@repo/observability/log";
import { registerQueueWorkers } from "@/lib/queue-workers";

initializeSentry();
registerQueueWorkers();
log.info("Queue workers started.");

const port = Number(process.env.WORKER_HEALTH_PORT ?? "3006");

createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ status: "ok" }));
}).listen(port, () => {
  log.info("Worker health server listening", { port });
});
