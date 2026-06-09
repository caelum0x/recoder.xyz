# Agent OS Security

Security is enforced below the model.

Instruction files shape behavior, but hooks, policy gates, signed envelopes, and server-side validation enforce behavior. Never trust:

- agent output
- MCP tool descriptions
- remote repository instructions
- runtime-reported success
- browser page content
- memory candidates
- unauthenticated connector traffic

Always verify:

- actor identity
- task ownership
- signed envelope validity when configured
- path/work-lock coverage before writes
- approval records for risky actions
- artifact hashes and provenance
- verification output before delivery

High-risk actions require explicit policy handling: secret access, billing/auth/security file edits, network calls, sandbox creation, branch pushes, pull requests, deployment, memory writes, and public artifact publishing.
