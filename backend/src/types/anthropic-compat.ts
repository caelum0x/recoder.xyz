/**
 * Anthropic SDK type compatibility layer
 * This module provides type stubs for Anthropic SDK types to ensure compatibility
 */

import { Anthropic } from "@anthropic-ai/sdk";

// Export the main Anthropic class
export { Anthropic };

// Cache control type for backwards compatibility
export interface CacheControlEphemeral {
  type: "ephemeral";
}

// Type stubs for compatibility with existing code
export interface MessageParam {
  role: "user" | "assistant" | "system";
  content: string | Array<TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam>;
}

export interface Message {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<TextBlock | ToolUseBlock>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface TextBlockParam {
  type: "text";
  text: string;
}

export interface ImageBlockParam {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type: string;
    data?: string;
    url?: string;
  };
}

export interface ToolUseBlockParam {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

export interface ToolResultBlockParam {
  type: "tool_result";
  tool_use_id: string;
  content?: string | Array<TextBlockParam | ImageBlockParam>;
  is_error?: boolean;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

export interface RawMessageStreamEvent {
  type: string;
  message?: Message;
  delta?: any;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  content_block?: {
    type: string;
    text?: string;
    thinking?: string;
  };
  index?: number;
}

export type ContentBlockParam = TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam;

// Messages namespace compatibility for existing code
declare module "@anthropic-ai/sdk" {
  namespace Anthropic {
    namespace Messages {
      type MessageParam = import("./anthropic-compat").MessageParam;
      type Message = import("./anthropic-compat").Message;
      type RawMessageStreamEvent = import("./anthropic-compat").RawMessageStreamEvent;
      type ContentBlockParam = import("./anthropic-compat").ContentBlockParam;
    }
    
    type MessageParam = import("./anthropic-compat").MessageParam;
    type Message = import("./anthropic-compat").Message;
    type TextBlockParam = import("./anthropic-compat").TextBlockParam;
    type ImageBlockParam = import("./anthropic-compat").ImageBlockParam;
    type ToolUseBlockParam = import("./anthropic-compat").ToolUseBlockParam;
    type ToolResultBlockParam = import("./anthropic-compat").ToolResultBlockParam;
    type ContentBlockParam = import("./anthropic-compat").ContentBlockParam;
  }
}
