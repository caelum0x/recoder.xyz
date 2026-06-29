/**
 * PolicyPanel — evaluate an action against the live @recoder/agent-policy engine.
 *
 * The operator fills actor / action / target and submits; the panel POSTs
 * /api/agent-os/policy/evaluate and renders the REAL PolicyDecision returned by
 * the engine, with an explicit allow / needs_approval / deny badge plus the
 * decision reason and any findings. There is no client-side decision logic and no
 * fabricated outcome: the badge mirrors `decision.effect` exactly.
 *
 * Errors are classified truthfully (backend unreachable vs auth vs request error)
 * and the empty state explains the surface rather than implying a result.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import {
  POLICY_ACTIONS,
  buildPolicyEvaluateBody,
  effectLabel,
  effectTone,
  isPolicyFormValid,
  type PolicyFormInput,
} from '../lib/agent-os-state';
import type { PolicyAction, PolicyDecision } from '../types';

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Hint text describing what `target` means for the selected action. */
function targetHint(action: PolicyAction): string {
  if (action === 'file.read' || action === 'file.write') return 'file path, e.g. src/server.ts';
  if (action === 'command.run') return 'command, e.g. rm -rf node_modules';
  if (action === 'tool.call') return 'tool name, e.g. browser.navigate';
  return 'environment, e.g. production';
}

function DecisionView({ decision }: { decision: PolicyDecision }) {
  const tone = effectTone(decision.effect);
  return (
    <div class="policy-decision">
      <div class="policy-decision-head">
        <span class={`badge tone-${tone} policy-effect`}>{effectLabel(decision.effect)}</span>
        <span class="policy-decision-action">{decision.action}</span>
        <span class="policy-decision-actor">actor {decision.actorAgentId}</span>
      </div>
      <p class="policy-decision-reason">{decision.reason}</p>
      {decision.approval?.required && (
        <p class="policy-decision-approval">
          Approval gate required
          {decision.approval.gateId ? ` (${decision.approval.gateId})` : ''}
          {decision.approval.reason ? `: ${decision.approval.reason}` : ''}
        </p>
      )}
      {decision.findings && decision.findings.length > 0 && (
        <details class="policy-findings">
          <summary>{decision.findings.length} finding(s)</summary>
          <pre class="policy-findings-pre">{JSON.stringify(decision.findings, null, 2)}</pre>
        </details>
      )}
      <p class="policy-decision-meta">
        decision {decision.decisionId} · {new Date(decision.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

export function PolicyPanel() {
  const [form, setForm] = useState<PolicyFormInput>({
    actor: 'agent-cockpit',
    action: 'file.write',
    target: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);

  const valid = isPolicyFormValid(form);

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.evaluatePolicy(buildPolicyEvaluateBody(form));
      setDecision(result);
    } catch (err) {
      setDecision(null);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="policy-panel">
      <div class="panel-head">
        <h2 class="panel-title">Rules</h2>
        <span class="panel-head-sub">
          Live @recoder/agent-policy decision — POST /api/agent-os/policy/evaluate
        </span>
      </div>

      <form class="policy-form" onSubmit={submit}>
        <div class="field-row">
          <div class="field">
            <span>Actor (agentId)</span>
            <input
              value={form.actor}
              onInput={(e) => setForm((f) => ({ ...f, actor: (e.target as HTMLInputElement).value }))}
              placeholder="agent-cockpit"
            />
          </div>
          <div class="field">
            <span>Action</span>
            <select
              value={form.action}
              onChange={(e) =>
                setForm((f) => ({ ...f, action: (e.target as HTMLSelectElement).value as PolicyAction }))
              }
            >
              {POLICY_ACTIONS.map((a) => (
                <option value={a} key={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div class="field">
          <span>Target</span>
          <input
            value={form.target}
            onInput={(e) => setForm((f) => ({ ...f, target: (e.target as HTMLInputElement).value }))}
            placeholder={targetHint(form.action)}
          />
          <span class="field-hint">{targetHint(form.action)}</span>
        </div>
        {error && <p class="form-error">{error}</p>}
        <div class="modal-actions">
          <button class="btn btn-sm btn-primary" type="submit" disabled={!valid || busy}>
            {busy ? 'Evaluating…' : 'Evaluate policy'}
          </button>
        </div>
      </form>

      {decision ? (
        <DecisionView decision={decision} />
      ) : !error ? (
        <div class="panel-empty">
          <p>No evaluation yet.</p>
          <p class="panel-empty-sub">
            Submit an actor + action + target to run the real policy engine. The decision
            (allow / needs approval / deny) and its reason are returned by the backend —
            nothing is decided in the cockpit.
          </p>
        </div>
      ) : null}
    </section>
  );
}
