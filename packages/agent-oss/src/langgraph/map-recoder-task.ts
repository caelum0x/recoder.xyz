import type { OssAdapterRunInput, OssTaskMapping } from '../adapter-boundary';
import { mapLangGraphTask } from './langgraph-adapter';

export function mapRecoderTaskToLangGraph(input: OssAdapterRunInput): OssTaskMapping {
  return mapLangGraphTask(input);
}
