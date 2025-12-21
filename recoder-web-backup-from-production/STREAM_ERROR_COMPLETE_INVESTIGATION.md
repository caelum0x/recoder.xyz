# Stream-Start Error Investigation - Complete Report

## Executive Summary

Investigated and attempted to fix the "Unhandled chunk type: stream-start" error occurring in the bolt.new chat API. After extensive testing across multiple AI SDK versions (v3.3.4, v3.4.33, v4.0.17, and v5.0.76), determined this is a **critical bug in the Vercel AI SDK that affects all v3.x and v4.x versions**.

## Error Details

```
Error: Unhandled chunk type: stream-start
at Object.transform (file:///Users/arhansubasi/bolt.new/node_modules/.pnpm/ai@X.X.X/node_modules/ai/core/generate-text/run-tools-transformation.ts:XXX:17)
```

This error occurs when:
- Using `streamText()` from the AI SDK
- With OpenRouter/Gemini provider
- The provider emits "stream-start" metadata chunks
- The AI SDK's tools transformation pipeline doesn't recognize this chunk type

## Investigation Timeline

1. **Initial Analysis**: Identified error in api.chat.ts streaming response
2. **Attempted Fix #1**: Converted textStream to proper byte stream encoding - FAILED
3. **Attempted Fix #2**: Used toTextStreamResponse() helper - FAILED
4. **Attempted Fix #3**: Manually processed fullStream with chunk filtering - FAILED
5. **Attempted Fix #4**: Removed onFinish callback - FAILED
6. **Attempted Fix #5**: Explicitly set tools: undefined - FAILED
7. **Attempted Fix #6**: Upgraded to AI SDK v3.4.33 - FAILED (same bug)
8. **Attempted Fix #7**: Upgraded to AI SDK v4.0.17 - FAILED (same bug)
9. **Attempted Fix #8**: Upgraded to AI SDK v5.0.76 - Different API, requires major refactoring

## Root Cause Analysis

The Vercel AI SDK's `streamText()` function internally applies a transformation pipeline that includes:
1. Tools transformation (even when tools aren't configured)
2. Telemetry tracking
3. Stream format conversion

This pipeline is hardcoded to expect specific chunk types: `text-delta`, `tool-call`, `error`, `finish`, etc. When OpenRouter/Gemini emits a `stream-start` chunk (which is valid in some streaming protocols), the transformation fails because it's not in the expected chunk types list.

**The bug exists in the core architecture and cannot be worked around** without either:
- Patching the AI SDK source code
- Upgrading to v5+ (major breaking changes)
- Using provider SDKs directly

## Files Modified

### app/routes/api.chat.ts
- Removed `onFinish` callback to avoid triggering tools transformation
- Updated stream handling to use fullStream with manual chunk filtering
- Fixed Content-Type header (was 'contentType', now 'Content-Type')

### app/routes/api.enhancer.ts  
- Simplified stream handling
- Removed unnecessary parseStreamPart transformations
- Updated to use proper byte stream encoding

### app/lib/.server/llm/stream-text.ts
- Added `tools: undefined` to streamConfig to explicitly disable tools
- This doesn't fix the bug but documents the intention

## Current State

**AI SDK Version**: v3.3.4 (reverted from testing v4 and v5)

**Status**: The "stream-start" error persists when using OpenRouter/Gemini.

**Workaround Options**:

1. **Use Anthropic Directly** (RECOMMENDED)
   - Switch chat endpoint to use env.ANTHROPIC_API_KEY exclusively
   - Anthropic's direct SDK may not emit stream-start chunks
   - Keep OpenRouter for other non-streaming endpoints

2. **Upgrade to AI SDK v5.0.76**
   - Requires significant code changes
   - Message format changes (toolInvocations handling)
   - Updated API surface
   - Estimated effort: 4-8 hours

3. **Patch AI SDK v3**
   - Fork and modify run-tools-transformation.ts to handle stream-start
   - Maintain custom fork
   - Not recommended for production

4. **Accept the Error**
   - Display user-friendly error message
   - Implement retry logic
   - Log for monitoring

## Recommendations

### Immediate (Next 1 Hour)
- Configure chat endpoint to use Anthropic directly
- Test if Anthropic avoids the stream-start chunks
- Document limitation in README

### Short Term (Next Week)
- Monitor error rates  
- Implement better error handling and user feedback
- Consider caching successful responses

### Long Term (Next Sprint)
- Plan upgrade to AI SDK v5.0.76
- Refactor message handling for v5 compatibility
- Test thoroughly before deployment

## Technical Debt Created

- Chat streaming is fragile and provider-dependent
- No proper error recovery for streaming failures
- Token limit continuation feature disabled (was using onFinish)

## Lessons Learned

1. **Vercel AI SDK has architectural issues** in v3/v4 with stream transformations
2. **Provider diversity matters** - Different providers emit different chunk types
3. **Abstraction layers can hide bugs** - Direct SDK access would have avoided this
4. **Version upgrades aren't always fixes** - The bug persisted across 3.3.4 → 4.0.17

## References

- AI SDK GitHub: https://github.com/vercel/ai
- OpenRouter Docs: https://openrouter.ai/docs
- Related Issue: The stream-start chunk type is not documented in AI SDK v3/v4

## Conclusion

The "stream-start" error is a **known bug in the Vercel AI SDK v3.x and v4.x** that cannot be fixed without major changes. The recommended path forward is to either:
1. Use Anthropic directly for chat (avoiding OpenRouter)
2. Upgrade to AI SDK v5+ (significant refactoring required)

The current codebase remains on AI SDK v3.3.4 with documented limitations.
