export class RecoderCode {
  constructor();

  callOpenRouter(messages: any[], tools?: any): Promise<any>;
  executeToolCall(toolCall: any): Promise<string>;
  handleFileOperation(args: any): Promise<string>;
  handleBashCommand(args: any): Promise<string>;
  processConversation(userMessage: string): Promise<string>;
}

export function main(): Promise<void>;