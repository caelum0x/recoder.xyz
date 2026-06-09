# Evals

Evals are the future proof layer for Agent OS behavior. This document describes the expected coverage without adding new tests in this implementation slice.

Coverage targets:

- agent connects
- reconnect does not duplicate identity
- task compiles
- agent claims task
- logs stream
- artifact appears
- approval pauses and resumes
- forbidden path is blocked
- verification output is captured
- memory candidate is proposed, not silently written
- Beads status can sync
- Git Nexus context pack can be cited
- PAL plan can route runtime/skills/tools

User-facing launch proof remains:

```text
task -> artifact -> PR -> preview -> approval -> memory candidate
```
