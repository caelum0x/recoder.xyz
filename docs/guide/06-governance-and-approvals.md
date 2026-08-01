# Governance & approvals

Recoder governs what agents are allowed to do — **below the model**, so it doesn't
depend on trusting agent output. Instruction files shape behavior; the governance
gate, policy decisions, and a tamper-evident audit trail *enforce* it.

## The governance gate

Every risky action an agent (or the convergence flow) takes passes a policy gate
before it happens: git writes, PR creation, merges, secret access, network calls,
and similar. The gate returns one of:

- **allow** — proceed;
- **needs approval** — pause and wait for a human decision;
- **deny** — stop, with a reason.

The gate is **fail-closed**: if the policy engine is unavailable or errors, the
default is to deny, never to silently allow.

## Approvals

When an action needs human sign-off, it surfaces as an **approval**. Open the
**Approvals** view to see pending requests with their context — what's being
requested, by which run, and the risk tier — and **approve** or **reject** each.

- A merge that policy gates waits on your approval before any git write.
- Approvals are recorded; the decision (and who made it) becomes part of the
  evidence and audit trail.

You'll also get an OS notification when a run needs input or an approval, so you
don't have to babysit long runs.

## The audit trail

Every governed action is sealed into a **Merkle audit chain** — an append-only,
tamper-evident log. Each entry is content-hashed and linked to the previous one,
so any after-the-fact edit is detectable. You can read the audit trail scoped to a
workspace.

This is what lets Recoder make a strong claim it can *prove*: not just "the agent
did X," but "X was authorized by this policy, approved by this person, and here's
the tamper-evident record."

## Compliance evidence export

From a governed merge's evidence, you can export a **compliance pack** (JSON or
Markdown) that maps the evidence to a control catalog:

- **SOC 2** — CC8.1 (change management), CC7.2 (change verification before
  promotion);
- **EU AI Act** — Art. 12 (record-keeping / logging), Art. 14 (human oversight);
- **DORA** — ICT change control;
- **Recoder** — convergence integrity (per-file provenance with a verifiable hash).

Each control's status is **derived from a real evidence field**. A control is only
"met" when the backing evidence is actually present — e.g. *human oversight* is met
only when a real approval was recorded, `partial` for a high-risk change that was
auto-allowed without one, and `not-evidenced` for a low-risk auto-merge. Recoder
never fabricates a "met."

The export is content-hashed, and Ed25519-signed when a signing key is configured,
so a reviewer can verify it hasn't been altered.

## Solo / self-hosted mode

Running fully local without a cloud database, some cloud-oriented gates would
otherwise fail closed and block everything. Recoder has explicit solo-mode seams
that let the local workflow (create workspace, run, converge, merge) work
end-to-end while keeping the governance decisions and audit truthful. You get the
gate and the audit trail locally; you don't get blocked just because there's no
cloud backend.

Next: [Bring your own keys](./07-byok-and-keys.md).
