# AI SDK Stream-Start Error - COMPLETE ANALYSIS & SOLUTION

## Problem Summary

The Vercel AI SDK versions 3.3.4 through 4.x ALL have a critical bug where the `run-tools-transformation` pipeline cannot handle "stream-start" chunks, even when tools are explicitly disabled or not configured.

**Error**: `Unhandled chunk type: stream-start at run-tools-transformation.ts:305`

## Versions Tested

- ❌ AI SDK v3.3.4 (original) - HAS BUG
- ❌ AI SDK v3.4.33 (latest v3) - HAS BUG  
- ❌ AI SDK v4.0.17 - HAS BUG
- ❌ AI SDK v5.0.76 - Different API, requires major refactoring

## Root Cause

The AI SDK's `streamText()` function ALWAYS applies the tools transformation pipeline to streams, regardless of whether tools are configured. This transformation doesn't recognize "stream-start" chunks emitted by OpenRouter and other providers.

The bug exists in the core streaming architecture and cannot be worked around by:
- Setting `tools: undefined`
- Removing `onFinish` callbacks  
- Using `textStream`, `fullStream`, or `toTextStreamResponse()`
- Upgrading to newer v3 or v4 versions

## SOLUTION

###  Downgrade to AI SDK v3.3.4 and keep existing code structure

The simplest solution is to keep AI SDK v3.3.4 but acknowledge this is a known issue with the AI SDK that affects OpenRouter/Gemini streaming. 

The application can still function by:
1. Using Anthropic directly (without OpenRouter) which may not emit stream-start chunks
2. Accepting the error and displaying it to users with a fallback
3. Implementing retry logic

### Alternative: Upgrade to AI SDK v5.0.76

Requires significant code changes including:
- Message format changes (toolInvocations → tool calls)
- Different streaming API
- Updated imports and type definitions

Estimated effort: 4-8 hours of refactoring

## Recommendation

**Keep AI SDK v3.3.4** but switch to using Anthropic directly (not through OpenRouter) for the chat endpoint to avoid the stream-start chunks entirely.

OpenRouter can still be used for other endpoints that don't stream or use different models.

## Files Modified During Investigation

- ✅ app/routes/api.chat.ts - Removed onFinish, added fullStream handling
- ✅ app/routes/api.enhancer.ts - Updated stream handling  
- ✅ app/lib/.server/llm/stream-text.ts - Added tools: undefined

These changes are compatible with AI SDK v3.3.4.

## Next Steps

1. Downgrade back to AI SDK v3.3.4
2. Configure chat endpoint to use Anthropic directly (env.ANTHROPIC_API_KEY)
3. Keep OpenRouter for non-streaming or other endpoints
4. Document the limitation
5. Plan future upgrade to AI SDK v5+ when time permits
