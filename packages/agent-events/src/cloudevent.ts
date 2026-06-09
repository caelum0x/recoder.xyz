import type { RecoderAgentEventType } from './event-types';

export type RecoderCloudEvent<T = Record<string, unknown>> = {
  specversion: '1.0';
  id: string;
  source: `recoder://${string}`;
  type: RecoderAgentEventType;
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  data: T;
};

export function createRecoderCloudEvent<T>(input: {
  id: string;
  type: RecoderAgentEventType;
  source: `recoder://${string}`;
  subject: string;
  data: T;
  time?: string;
}): RecoderCloudEvent<T> {
  return {
    specversion: '1.0',
    id: input.id,
    source: input.source,
    type: input.type,
    subject: input.subject,
    time: input.time ?? new Date().toISOString(),
    datacontenttype: 'application/json',
    data: input.data,
  };
}
