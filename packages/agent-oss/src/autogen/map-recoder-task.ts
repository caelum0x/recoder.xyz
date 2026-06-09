import type { OssAdapterRunInput, OssTaskMapping } from '../adapter-boundary';
import { mapAutogenTask } from './autogen-adapter';

export function mapRecoderTaskToAutoGen(input: OssAdapterRunInput): OssTaskMapping {
  return mapAutogenTask(input);
}
