import { InstructionSourceKindEnum } from '@recoder/a2a-sdk';
import { sha256Hex, type LoadedInstructionSource } from '../provenance';

export type Context7InstructionContext = {
  refId: string;
  title: string;
  excerpt: string;
  sourceUrl?: string;
};

export function loadContext7InstructionSource(context: Context7InstructionContext): LoadedInstructionSource {
  const content = [
    `Context7 reference: ${context.title}`,
    context.sourceUrl ? `Source: ${context.sourceUrl}` : undefined,
    context.excerpt,
  ].filter(Boolean).join('\n');

  return {
    ref: {
      ref_id: `context7:${context.refId}`,
      kind: InstructionSourceKindEnum.Custom,
      title: context.title,
      path: context.sourceUrl ?? `context7/${context.refId}`,
      sha: sha256Hex(content),
      excerpt: context.excerpt.slice(0, 240),
    },
    content,
  };
}
