# Memory

Memory is reviewable operational knowledge, not untracked model notes. Agents propose `MemoryCandidate` records with evidence, then policy, PM, or humans approve them into scoped memory.

Canonical memory belongs to Recoder. mem0 and pgvector can support retrieval, but writes must cite task and artifact evidence. (Correction 2026-06-19: production retrieval runs on on-box Qdrant + text-embedding-inference plus pgvector on self-hosted PostgreSQL 17; mem0 is experimental and not deployed.)

Use `MemoryReviewWorkflow` for the write path: `propose` creates an evidence-linked candidate through `MemoryStore`, and `review` either records rejection or materializes an accepted `MemoryItem`. Agents should not call `upsertMemory` directly.
