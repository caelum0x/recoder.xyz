type OutboxRecord = {
  outboxId: string;
  status: 'pending' | 'published' | 'failed' | 'discarded';
  event?: {
    id?: string;
    type?: string;
  };
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string | { message?: string };
};

type DrainResult = {
  status: string;
  operation: 'outbox.drain';
  processed: number;
  attempted: number;
  published: number;
  failed: number;
  remainingPending: number;
};

type StreamState = {
  messages: number;
  last_seq: number;
};

type StreamInfo = {
  state: StreamState;
};

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printUsage();
  process.exit(0);
}

const allowEmpty = args.has('--allow-empty');
const apiUrl = normalizeBaseUrl(
  process.env.RECODER_AGENT_OS_API_URL ||
    process.env.AGENT_OS_API_URL ||
    process.env.RECODER_API_URL ||
    'http://localhost:4000',
);
const internalServiceKey = process.env.INTERNAL_SERVICE_KEY;
const natsUrl = process.env.NATS_URL;
const streamName = process.env.AGENT_OS_NATS_STREAM || 'RECODER_AGENT_EVENTS';
const limit = readPositiveInteger(process.env.AGENT_OS_OUTBOX_DRAIN_LIMIT, 100);

async function main() {
  requireEnv('INTERNAL_SERVICE_KEY', internalServiceKey);
  requireEnv('NATS_URL', natsUrl);

  const natsLib = await import('nats');
  const nc = await natsLib.connect({ servers: natsUrl });
  const jsm = await nc.jetstreamManager();

  try {
    const streamBefore = await streamInfo(jsm, streamName);
    const before = await getOutbox();
    const pendingBefore = before.filter((record) => record.status === 'pending');

    if (pendingBefore.length === 0 && !allowEmpty) {
      throw new Error(
        'Agent OS outbox has no pending records. Trigger a real Agent OS event first, or pass --allow-empty for config-only verification.',
      );
    }

    const drain = await postDrain(limit);
    const after = await getOutbox();
    const pendingAfter = after.filter((record) => record.status === 'pending');
    const streamAfter = await streamInfo(jsm, streamName);

    if (pendingBefore.length > 0) {
      assertPositive(drain.processed, 'drain processed records');
      assertPositive(drain.published, 'drain published records');
      assertZero(drain.failed, 'drain failed records');

      if (pendingAfter.length >= pendingBefore.length) {
        throw new Error(
          `pending outbox count did not decrease: before=${pendingBefore.length} after=${pendingAfter.length}`,
        );
      }

      if (streamAfter.state.last_seq <= streamBefore.state.last_seq) {
        throw new Error(
          `NATS stream ${streamName} last_seq did not advance: before=${streamBefore.state.last_seq} after=${streamAfter.state.last_seq}`,
        );
      }
    }

    console.log(JSON.stringify({
      ok: true,
      apiUrl,
      stream: streamName,
      pendingBefore: pendingBefore.length,
      pendingAfter: pendingAfter.length,
      drain,
      nats: {
        messagesBefore: streamBefore.state.messages,
        messagesAfter: streamAfter.state.messages,
        lastSeqBefore: streamBefore.state.last_seq,
        lastSeqAfter: streamAfter.state.last_seq,
      },
      mode: pendingBefore.length === 0 ? 'config-only' : 'published-real-outbox-records',
    }, null, 2));
  } finally {
    await nc.close();
  }
}

async function getOutbox(): Promise<OutboxRecord[]> {
  const envelope = await requestJson<OutboxRecord[]>(`${apiUrl}/api/agent-os/outbox`, {
    method: 'GET',
    headers: authHeaders(),
  });
  return envelope;
}

async function postDrain(drainLimit: number): Promise<DrainResult> {
  return await requestJson<DrainResult>(`${apiUrl}/internal/agent-os/outbox/drain`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit: drainLimit }),
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success) {
    const error = typeof body?.error === 'string' ? body.error : body?.error?.message;
    throw new Error(`${init.method ?? 'GET'} ${url} failed: ${response.status} ${error ?? response.statusText}`);
  }
  if (body.data === undefined) {
    throw new Error(`${init.method ?? 'GET'} ${url} returned no data`);
  }
  return body.data;
}

async function streamInfo(jsm: any, name: string): Promise<StreamInfo> {
  try {
    return await jsm.streams.info(name);
  } catch (error) {
    throw new Error(`NATS JetStream stream ${name} is missing or unreachable: ${errorMessage(error)}`);
  }
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${internalServiceKey}`,
    'x-internal-service-key': internalServiceKey ?? '',
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : fallback;
}

function requireEnv(name: string, value: string | undefined): asserts value is string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

function assertPositive(value: number, label: string): void {
  if (value <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
}

function assertZero(value: number, label: string): void {
  if (value !== 0) {
    throw new Error(`${label} must be zero`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printUsage(): void {
  console.log(`Usage:
  RECODER_AGENT_OS_API_URL=https://docker.recoder.xyz \\
  INTERNAL_SERVICE_KEY=... \\
  NATS_URL=nats://... \\
  pnpm --dir docker-backend run agent-os:verify-outbox-nats

Options:
  --allow-empty  Pass when verifying only endpoint/NATS reachability and no pending outbox records exist.

Environment:
  RECODER_AGENT_OS_API_URL or AGENT_OS_API_URL or RECODER_API_URL
  INTERNAL_SERVICE_KEY
  NATS_URL
  AGENT_OS_NATS_STREAM defaults to RECODER_AGENT_EVENTS
  AGENT_OS_OUTBOX_DRAIN_LIMIT defaults to 100`);
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
