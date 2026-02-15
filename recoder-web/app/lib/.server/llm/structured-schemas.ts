import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('StructuredSchemas');
/**
 * Structured Output Schemas for OpenRouter
 *
 * These schemas enforce type-safe, validated responses from AI models
 * that support structured outputs (GPT-4o, Gemini 2.5 Flash, Fireworks models)
 */

/**
 * Schema for Bolt artifact responses
 * Enforces the <recoderArtifact> and <recoderAction> XML structure
 */
export const RECODER_ARTIFACT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'bolt_artifact_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        // The user-facing message/explanation
        message: {
          type: 'string',
          description: 'Explanation or response to the user about what you\'re doing'
        },

        // The artifact containing code/files/commands
        artifact: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the artifact in kebab-case (e.g., "todo-app-react")'
            },
            title: {
              type: 'string',
              description: 'Title of the artifact'
            },
            actions: {
              type: 'array',
              description: 'Array of actions to perform (shell commands or file operations)',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['shell', 'file'],
                    description: 'Type of action: "shell" for commands, "file" for file operations'
                  },
                  content: {
                    type: 'string',
                    description: 'For shell: the command to run. For file: the file content'
                  },
                  filePath: {
                    type: ['string', 'null'],
                    description: 'For file actions: relative path to the file. For shell: null'
                  }
                },
                required: ['type', 'content'],
                additionalProperties: false
              }
            }
          },
          required: ['id', 'title', 'actions'],
          additionalProperties: false
        }
      },
      required: ['message', 'artifact'],
      additionalProperties: false
    }
  }
} as const;

/**
 * Check if a model supports structured outputs
 */
export function supportsStructuredOutputs(modelId: string): boolean {
  // Models that support structured outputs according to OpenRouter docs
  const supportedModels = [
    // OpenAI models
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4o-2024-11-20',
    'openai/gpt-4o-2024-08-06',
    'openai/gpt-4o-mini-2024-07-18',

    // Google models
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'google/gemini-2.0-flash',
    'google/gemini-pro-1.5',

    // Fireworks models (all supported)
    'fireworks/',  // Prefix check
  ];

  return supportedModels.some(supported =>
    modelId === supported || modelId.startsWith(supported)
  );
}

/**
 * Convert XML artifact format to JSON structured output
 * This is used to parse the structured JSON response and convert it to XML
 */
export function convertStructuredToXML(structured: any): string {
  const { message, artifact } = structured;

  let xml = message + '\n\n';
  xml += `<recoderArtifact id="${artifact.id}" title="${artifact.title}">\n`;

  for (const action of artifact.actions) {
    if (action.type === 'shell') {
      xml += `  <recoderAction type="shell">\n`;
      xml += `${action.content}\n`;
      xml += `  </recoderAction>\n`;
    } else if (action.type === 'file') {
      xml += `  <recoderAction type="file" filePath="${action.filePath}">\n`;
      xml += `${action.content}\n`;
      xml += `  </recoderAction>\n`;
    }
  }

  xml += `</recoderArtifact>`;

  return xml;
}

/**
 * Simplified schema for simple queries (no artifact needed)
 */
export const SIMPLE_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'simple_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Response to the user'
        },
        needsArtifact: {
          type: 'boolean',
          description: 'Whether this response requires code/files (artifact)'
        }
      },
      required: ['message', 'needsArtifact'],
      additionalProperties: false
    }
  }
} as const;

/**
 * Determine which schema to use based on the user's request
 */
export function selectSchema(userMessage: string): typeof RECODER_ARTIFACT_SCHEMA | typeof SIMPLE_RESPONSE_SCHEMA | null {
  const lowerMessage = userMessage.toLowerCase();

  // Keywords that indicate need for artifact/code
  const artifactKeywords = [
    'create', 'build', 'make', 'develop', 'code', 'implement',
    'add', 'update', 'modify', 'change', 'fix', 'improve',
    'app', 'application', 'project', 'website', 'api', 'backend',
    'component', 'function', 'class', 'file', 'install', 'run'
  ];

  const needsArtifact = artifactKeywords.some(keyword => lowerMessage.includes(keyword));

  if (needsArtifact) {
    return RECODER_ARTIFACT_SCHEMA;
  }

  // For simple questions, use simple schema
  return SIMPLE_RESPONSE_SCHEMA;
}

/**
 * Check if we should use structured outputs for this request
 * Returns null if structured outputs shouldn't be used (fallback to regular streaming)
 */
export function shouldUseStructuredOutputs(
  modelId: string,
  userMessage: string,
  useStructuredOutputs: boolean = true
): typeof RECODER_ARTIFACT_SCHEMA | typeof SIMPLE_RESPONSE_SCHEMA | null {
  // Feature flag check
  if (!useStructuredOutputs) {
    return null;
  }

  // Model support check
  if (!supportsStructuredOutputs(modelId)) {
    logger.info(`⚠️  Model ${modelId} does not support structured outputs, using regular streaming`);
    return null;
  }

  // Select appropriate schema
  return selectSchema(userMessage);
}
