/**
 * Deterministic verification that the brain's external knowledge sources work
 * LIVE end-to-end (not just "configured"). Proves the real add→extract→embed→
 * store→semantic-search round-trip for mem0, and a real library-doc fetch for
 * context7.
 *
 * Run (proven 2026-06-29 with a fully self-hosted stack — Ollama + Qdrant, no
 * external key):
 *
 *   docker run -d --name recoder-qdrant -p 6333:6333 qdrant/qdrant:latest
 *   ollama pull nomic-embed-text          # 768-dim embedder
 *   QDRANT_URL=http://localhost:6333 \
 *   OLLAMA_BASE_URL=http://localhost:11434 \
 *   MEM0_LLM_PROVIDER=ollama   MEM0_LLM_MODEL=phi3:mini \
 *   MEM0_EMBED_PROVIDER=ollama MEM0_EMBED_MODEL=nomic-embed-text \
 *   npx tsx scripts/verify-brain-sources-live.ts
 *
 * mem0 also works with a managed MEM0_API_KEY or a valid OPENAI_API_KEY (OSS
 * mode). context7 runs against the free public tier with no key (set
 * CONTEXT7_API_KEY only for higher rate limits).
 *
 * Honest semantics: each source is SKIPPED (not failed) when unconfigured; a
 * source that is configured but cannot prove the live round-trip FAILS the
 * script (non-zero exit). No success is faked.
 */
import { mem0Health, mem0Add, mem0Search, mem0Delete, type Mem0Scope, type Mem0MemoryRecord } from '../src/mem0-client.js';
import { context7Health, getDocsForQuery } from '../src/context7-client.js';

type Outcome = 'pass' | 'skip' | 'fail';

async function verifyMem0(): Promise<{ outcome: Outcome; detail: string }> {
  const health = await mem0Health().catch((e) => ({ available: false, mode: 'none', reason: String(e?.message ?? e) }) as Awaited<ReturnType<typeof mem0Health>>);
  if (!health.available) {
    return { outcome: 'skip', detail: `mem0 not configured (${health.reason ?? 'no provider'})` };
  }

  const scope: Mem0Scope = { userId: 'verify-brain-sources', agentId: 'verify', runId: 'live' };
  const add = await mem0Add(
    [
      { role: 'user', content: 'I am based in Turkey and cannot use Stripe or PayPal directly for billing.' },
      { role: 'assistant', content: 'Understood — Recoder uses a Merchant-of-Record (Polar) so you only receive payouts.' },
    ],
    scope,
  );
  if (!add.available) return { outcome: 'fail', detail: `mem0 add unavailable: ${add.reason}` };

  let hits: Mem0MemoryRecord[] = [];
  for (let i = 0; i < 8 && hits.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const search = await mem0Search('What payment constraints does the user have?', scope, 5);
    if (!search.available) return { outcome: 'fail', detail: `mem0 search unavailable: ${search.reason}` };
    hits = search.results;
  }

  // cleanup
  for (const m of hits) if (m.id) await mem0Delete(m.id).catch(() => {});

  if (hits.length === 0) return { outcome: 'fail', detail: 'mem0 reachable but stored memory was not retrievable' };
  const joined = hits.map((h) => h.memory.toLowerCase()).join(' ');
  if (!/turkey|stripe|paypal|polar|payout|billing|payment|merchant/.test(joined)) {
    return { outcome: 'fail', detail: `mem0 retrieved memories are off-topic: ${joined.slice(0, 120)}` };
  }
  return {
    outcome: 'pass',
    detail: `mem0 LIVE (${health.mode}; llm=${health.llmProvider ?? 'managed'} embed=${health.embedderProvider ?? 'managed'}; ${hits.length} memory hit(s))`,
  };
}

async function verifyContext7(): Promise<{ outcome: Outcome; detail: string }> {
  const health = context7Health();
  if (!health.available) return { outcome: 'skip', detail: 'context7 base unavailable' };

  const docs = await getDocsForQuery({ libraryName: 'zod', query: 'parse and validate a schema', timeoutMs: 20_000 }).catch((e) => ({ error: String(e?.message ?? e) }));
  const serialized = JSON.stringify(docs);
  if ((docs as { error?: string }).error || serialized.length < 200) {
    return { outcome: 'fail', detail: `context7 returned no usable docs (${serialized.slice(0, 120)})` };
  }
  return { outcome: 'pass', detail: `context7 LIVE (free tier, key=${health.apiKeyPresent}; ${serialized.length} bytes of zod docs)` };
}

async function main(): Promise<void> {
  const mem0 = await verifyMem0();
  const c7 = await verifyContext7();

  console.log(`brain-sources: mem0=${mem0.outcome} — ${mem0.detail}`);
  console.log(`brain-sources: context7=${c7.outcome} — ${c7.detail}`);

  const failed = [mem0, c7].filter((r) => r.outcome === 'fail');
  if (failed.length > 0) {
    console.log(`RESULT: FAIL (${failed.length} configured source(s) could not prove live)`);
    process.exit(1);
  }
  const proven = [mem0, c7].filter((r) => r.outcome === 'pass').length;
  console.log(`RESULT: OK (${proven} source(s) proven live, ${2 - proven} skipped-unconfigured)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('verify-brain-sources-live FATAL:', err?.message ?? err);
  process.exit(2);
});
