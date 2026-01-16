import { inlineSuggestion } from './inline-suggestion';
import type { EditorState } from '@codemirror/state';

export type SuggestionRequestCallback = (prefix: string, suffix: string) => Promise<string>;

const localSuggestionsCache: { [key: string]: string } = {};

function wrapUserFetcher(onSuggestionRequest: SuggestionRequestCallback) {
  return async function fetchSuggestion(state: EditorState) {
    const { from, to } = state.selection.ranges[0];
    const text = state.doc.toString();
    const prefix = text.slice(0, to);
    const suffix = text.slice(from);

    const key = `${prefix}<:|:>${suffix}`;
    if (localSuggestionsCache[key]) {
      return localSuggestionsCache[key];
    }

    const prediction = await onSuggestionRequest(prefix, suffix);
    localSuggestionsCache[key] = prediction;
    return prediction;
  };
}

export const inlineCopilot = (onSuggestionRequest: SuggestionRequestCallback, delay = 1000, acceptOnClick = true) => {
  return inlineSuggestion({
    fetchFn: wrapUserFetcher(onSuggestionRequest),
    delay,
    acceptOnClick,
  });
};

export const clearLocalCache = () => {
  Object.keys(localSuggestionsCache).forEach((key) => delete localSuggestionsCache[key]);
};
