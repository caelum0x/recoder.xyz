// recodergit/src/core/ingestion/call-extractors/configs/csharp.ts

import { SupportedLanguages } from '@recoder/recodergit-engine-shared';
import type { CallExtractionConfig } from '../../call-types.js';

export const csharpCallConfig: CallExtractionConfig = {
  language: SupportedLanguages.CSharp,
  typeAsReceiverHeuristic: true,
};
