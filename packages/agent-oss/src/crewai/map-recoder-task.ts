import type { OssAdapterRunInput, OssTaskMapping } from '../adapter-boundary';
import { mapCrewAiTask } from './crewai-adapter';

export function mapRecoderTaskToCrewAI(input: OssAdapterRunInput): OssTaskMapping {
  return mapCrewAiTask(input);
}
