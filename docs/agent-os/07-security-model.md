# Security Model

Recoder enforces trust below the model.

Primary gates:

- signed ingress envelopes
- agent identity and session health
- task ownership
- path permissions
- work locks
- approval rules
- secret scanning
- artifact hashing
- verification evidence
- memory review

Never trust runtime claims without evidence. A runtime can report that tests passed, but Recoder should keep command output, artifact refs, preview checks, or approval records as proof.

High-risk actions should default to approval unless policy explicitly allows them: branch push, pull request creation, deployment, billing/auth/security edits, secret access, durable memory writes, and public artifact publication.
