# Sandboxes

Daytona, E2B, and local containers are `SandboxProvider` implementations. They provide execution environments, process logs, file mutation evidence, previews, and snapshots.

Sandbox state is evidence. Recoder Agent OS remains the source of truth for identity, approvals, run lifecycle, and audit history.

Sandbox providers expose optional command, snapshot, and evidence methods. Convert provider evidence into Agent OS artifacts with `createSandboxEvidenceArtifact`; do not persist sandbox-only state as the canonical run record.

Browser proof should use `BrowserVerificationPlan`, per-tool `BrowserVerificationCheckResult` records, and `createBrowserVerificationSummaryArtifact`. The summary artifact gives PM, Agency, and client handoff surfaces one structured preview verdict instead of raw browser logs only.
