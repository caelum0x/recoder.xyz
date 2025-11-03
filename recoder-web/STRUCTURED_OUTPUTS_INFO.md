# OpenRouter Structured Outputs - Future Enhancement

## Overview

OpenRouter supports **structured outputs** which enforce JSON Schema validation on model responses. This feature is available on:
- OpenAI GPT-4o and later models
- Google Gemini 2.5 Flash and Pro
- All Fireworks-provided models

## Current Status

**NOT IMPLEMENTED** - The current bolt.new clone uses XML artifact format which works well. Implementing structured outputs would require major frontend changes to parse JSON instead of XML.

## How It Works

### Request Format
```typescript
{
  "model": "google/gemini-2.5-flash",
  "messages": [...],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "response_schema",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" },
          "temperature": { "type": "number" }
        },
        "required": ["location", "temperature"],
        "additionalProperties": false
      }
    }
  }
}
```

### Checking Model Support

You can check which parameters a model supports:

```bash
curl "https://openrouter.ai/api/v1/models/google/gemini-2.5-flash/endpoints" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.data.endpoints[0].supported_parameters'
```

**Gemini 2.5 Flash supports:**
- `structured_outputs`
- `response_format`
- `tools`
- `tool_choice`
- `reasoning`
- And more...

**GPT-4o supports:**
- `structured_outputs`
- `response_format`
- `tools`
- `tool_choice`
- And more...

## Benefits

1. **Type Safety**: Guaranteed JSON structure matching your schema
2. **No Parsing Errors**: Eliminates malformed JSON responses
3. **Validation**: Ensures all required fields are present
4. **Better UX**: More reliable file creation and code generation

## Implementation Options

### Option 1: Response Format (Structured Outputs)

Change the entire response format from XML to JSON:

```typescript
// Define schema
const ARTIFACT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'bolt_artifact',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        artifact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['shell', 'file'] },
                  content: { type: 'string' },
                  filePath: { type: ['string', 'null'] }
                },
                required: ['type', 'content']
              }
            }
          },
          required: ['id', 'title', 'actions']
        }
      },
      required: ['message', 'artifact']
    }
  }
};

// Add to streamText call
const result = await streamText({
  model: openrouter('google/gemini-2.5-flash'),
  messages,
  response_format: ARTIFACT_SCHEMA,
});
```

**Pros:**
- Guaranteed valid structure
- No XML parsing errors
- Type-safe responses

**Cons:**
- Requires complete frontend rewrite
- Breaking change to existing system
- XML artifacts already work well

### Option 2: Tools (Function Calling)

Use Vercel AI SDK's tool system:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const createFileTool = tool({
  description: 'Create or update a file',
  parameters: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
  execute: async ({ filePath, content }) => {
    return { success: true };
  },
});

const result = await streamText({
  model: openrouter('google/gemini-2.5-flash'),
  messages,
  tools: {
    createFile: createFileTool,
  },
});
```

**Pros:**
- Native SDK support
- Streaming tool calls
- Type-safe parameters

**Cons:**
- Requires frontend changes
- Different UX from current XML system

### Option 3: Hybrid Approach (Keep XML, Add Validation)

Keep XML artifacts but add optional JSON validation layer:

```typescript
// Parse XML artifact
const artifact = parseXMLArtifact(response);

// Validate structure
const validated = validateArtifact(artifact, schema);

if (!validated.valid) {
  // Retry with error feedback
  retry();
}
```

**Pros:**
- No breaking changes
- Backwards compatible
- Gradual enhancement

**Cons:**
- Doesn't prevent bad responses
- Still relies on XML parsing

## Recommendation

**Do NOT implement structured outputs right now** because:

1. ✅ **Current system works**: XML artifacts are parsed successfully
2. ✅ **Streaming fixed**: Official OpenRouter SDK provider resolves streaming issues
3. ❌ **Major refactor needed**: Would require rewriting frontend parser
4. ❌ **Breaking change**: All existing functionality would need updates
5. ❌ **No immediate benefit**: Current error rate is acceptably low

## Future Considerations

If we decide to implement structured outputs in the future:

1. **Start with tools**: Implement tool calling first (easier migration)
2. **Gradual rollout**: Support both XML and JSON responses
3. **Feature flag**: Make it opt-in initially
4. **Test thoroughly**: Ensure no regressions in file creation/streaming

## Files Created for Reference

- `/app/lib/.server/llm/structured-schemas.ts` - Schema definitions (NOT USED)
- `/app/lib/.server/llm/tools.ts` - Tool definitions (NOT USED)
- This documentation file

These files are kept for future reference but are not currently integrated into the system.

## Related Documentation

- [OpenRouter Structured Outputs](https://openrouter.ai/docs/features/structured-outputs)
- [OpenRouter Streaming](https://openrouter.ai/docs/api-reference/streaming)
- [OpenRouter Endpoints API](https://openrouter.ai/docs/api-reference/endpoints/list-endpoints)
- [Vercel AI SDK Tools](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)

---

**Status**: ✅ RESEARCHED, NOT IMPLEMENTED
**Date**: October 21, 2025
**Decision**: Keep current XML artifact system, revisit if error rates increase
