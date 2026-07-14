import { NatsEventPublisher } from '@recoder/agent-events';

const RECODER_EVENTS_STREAM = 'RECODER_AGENT_EVENTS';
const RECODER_EVENTS_SUBJECTS = ['recoder.>'];

export type NatsOutboxPublisherHandle = {
  publisher: NatsEventPublisher;
  close(): Promise<void>;
};

export async function createNatsOutboxPublisher(
  natsUrl = process.env.NATS_URL,
): Promise<NatsOutboxPublisherHandle> {
  if (!natsUrl) {
    throw new Error('NATS_URL is required to drain Agent OS outbox records');
  }

  let natsLib: any;
  try {
    natsLib = await (Function('return import("nats")')() as Promise<any>);
  } catch {
    throw new Error('nats package is required to drain Agent OS outbox records');
  }

  const nc = await natsLib.connect({ servers: natsUrl });
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  try {
    await jsm.streams.info(RECODER_EVENTS_STREAM);
  } catch {
    await jsm.streams.add({
      name: RECODER_EVENTS_STREAM,
      subjects: RECODER_EVENTS_SUBJECTS,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
      storage: 'file' as const,
      retention: 'limits' as const,
      discard: 'old' as const,
    });
  }

  return {
    publisher: new NatsEventPublisher({
      publish: async (subject, payload) => {
        await js.publish(subject, payload);
      },
    }),
    close: async () => {
      await nc.close();
    },
  };
}
