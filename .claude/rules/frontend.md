# Agent OS Frontend Rules

Agent OS UI should show control-plane state, not raw prompt chats.

Required surfaces:

- online agents and capabilities
- current task and run state
- loaded instruction sources and provenance
- memory refs and memory candidates
- policy restrictions and work locks
- approval waits
- verification output
- artifacts, pull requests, and preview state

Prefer explicit state labels and evidence links over generic "AI is working" copy. If data is unavailable, show the missing source clearly instead of faking success.
