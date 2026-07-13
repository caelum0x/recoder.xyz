// recodergit/src/core/ingestion/call-extractors/configs/go.ts

import { SupportedLanguages } from '@recoder/recodergit-engine-shared';
import type { CallExtractionConfig } from '../../call-types.js';

export const goCallConfig: CallExtractionConfig = {
  language: SupportedLanguages.Go,
};
