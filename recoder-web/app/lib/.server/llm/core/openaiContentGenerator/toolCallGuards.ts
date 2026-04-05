import type OpenAI from 'openai';

export type FunctionToolCall = OpenAI.Chat.ChatCompletionMessageToolCall & {
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export function isFunctionToolCall(
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall,
): toolCall is FunctionToolCall {
  return toolCall.type === 'function' && 'function' in toolCall;
}
