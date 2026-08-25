"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./pilot-operations.module.css";

type AccessState = "locked" | "loading" | "unauthorized" | "unavailable" | "empty" | "success";
type PilotStatus = "started" | "completed" | "verified" | "cancelled";
type MetricDirection = "increase" | "decrease" | "exact";
type OperationState = "idle" | "busy" | "error" | "success";

interface LeadRef {
  id: string;
  createdAt: string;
}

interface PilotRecord {
  id: string;
  designPartnerLeadId: string;
  metricName: string;
  metricUnit: string;
  metricDirection: MetricDirection;
  baselineValue: number;
  targetValue: number;
  outcomeValue: number | null;
  proofUrl: string | null;
  status: PilotStatus;
  startedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

interface AdminRecords {
  leadRefs: LeadRef[];
  pilots: PilotRecord[];
}

interface Operation {
  state: OperationState;
  key: string;
  message: string;
}

type LoadResult =
  | { state: "unauthorized" | "unavailable"; error: string }
  | { state: "empty" | "success"; records: AdminRecords };

const DIRECTIONS: readonly { value: MetricDirection; label: string }[] = [
  { value: "decrease", label: "Lower is better" },
  { value: "increase", label: "Higher is better" },
  { value: "exact", label: "Exact target" },
];

const EMPTY_OPERATION: Operation = { state: "idle", key: "", message: "" };

export default function PilotOperationsPage() {
  const [secret, setSecret] = useState("");
  const [access, setAccess] = useState<AccessState>("locked");
  const [accessMessage, setAccessMessage] = useState("Enter the pilot admin secret for this session.");
  const [records, setRecords] = useState<AdminRecords | null>(null);
  const [operation, setOperation] = useState<Operation>(EMPTY_OPERATION);

  const busy = operation.state === "busy";

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secret) {
      setAccess("unauthorized");
      setAccessMessage("Enter the configured admin secret.");
      return;
    }
    setAccess("loading");
    setAccessMessage("Loading private pilot records.");
    setRecords(null);
    setOperation(EMPTY_OPERATION);
    applyLoadResult(await loadAdminRecords(secret));
  }

  function applyLoadResult(result: LoadResult) {
    if (result.state === "unauthorized" || result.state === "unavailable") {
      if (result.state === "unauthorized") setSecret("");
      setAccess(result.state);
      setAccessMessage(result.error);
      setRecords(null);
      return;
    }
    setRecords(result.records);
    setAccess(result.state);
    setAccessMessage(
      result.state === "empty"
        ? "No design-partner leads or pilots are recorded."
        : `${result.records.leadRefs.length} lead refs and ${result.records.pilots.length} pilots loaded.`,
    );
  }

  function lock() {
    setSecret("");
    setRecords(null);
    setAccess("locked");
    setAccessMessage("Enter the pilot admin secret for this session.");
    setOperation(EMPTY_OPERATION);
  }

  async function mutate(
    key: string,
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
    successMessage: string,
  ): Promise<boolean> {
    setOperation({ state: "busy", key, message: "Saving the pilot record." });
    let response: Response;
    try {
      response = await fetch("/api/admin/pilots", {
        method,
        cache: "no-store",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      setOperation({ state: "error", key, message: "The pilot API could not be reached. No success was assumed." });
      return false;
    }

    const body = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
    if (!response.ok || !body?.success) {
      if (response.status === 401) {
        setSecret("");
        setAccess("unauthorized");
        setAccessMessage("The admin secret was rejected.");
        setRecords(null);
      } else if (response.status === 503) {
        setAccess("unavailable");
        setAccessMessage(body?.error || "Pilot administration is unavailable.");
        setRecords(null);
      }
      setOperation({ state: "error", key, message: body?.error || "The pilot record was not saved." });
      return false;
    }

    const refreshed = await loadAdminRecords(secret);
    applyLoadResult(refreshed);
    if (refreshed.state === "unauthorized" || refreshed.state === "unavailable") {
      setOperation({ state: "error", key, message: "The update was accepted, but the server state could not be refreshed." });
      return false;
    }
    setOperation({ state: "success", key, message: successMessage });
    return true;
  }

  async function createPilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await mutate("create", "POST", {
      designPartnerLeadId: form.get("designPartnerLeadId"),
      metricName: form.get("metricName"),
      metricUnit: form.get("metricUnit"),
      metricDirection: form.get("metricDirection"),
      baselineValue: Number(form.get("baselineValue")),
      targetValue: Number(form.get("targetValue")),
    }, "Pilot started and server records refreshed.");
    if (saved) formElement.reset();
  }

  async function completePilot(event: FormEvent<HTMLFormElement>, pilotId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`complete:${pilotId}`, "PATCH", {
      pilotId,
      status: "completed",
      outcomeValue: Number(form.get("outcomeValue")),
      proofUrl: form.get("proofUrl"),
    }, `Pilot ${pilotId} completed and server records refreshed.`);
  }

  async function transitionPilot(pilot: PilotRecord, status: "verified" | "cancelled") {
    const prompt = status === "verified"
      ? `Verify pilot ${pilot.id}? Verified is a terminal status.`
      : `Cancel pilot ${pilot.id}? Cancelled is a terminal status.`;
    if (!window.confirm(prompt)) return;
    await mutate(`${status}:${pilot.id}`, "PATCH", {
      pilotId: pilot.id,
      status,
    }, `Pilot ${pilot.id} moved to ${status} and server records refreshed.`);
  }

  const started = records?.pilots.filter((pilot) => pilot.status === "started").length || 0;
  const completed = records?.pilots.filter((pilot) => pilot.status === "completed").length || 0;
  const verified = records?.pilots.filter((pilot) => pilot.status === "verified").length || 0;
  const cancelled = records?.pilots.filter((pilot) => pilot.status === "cancelled").length || 0;
  const unlocked = access === "empty" || access === "success";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">RECODER</Link>
        <span>PRIVATE PILOT OPERATIONS</span>
      </header>

      <section className={styles.hero}>
        <div>
          <p>Authorized operations ledger</p>
          <h1>Pilot<br />operations.</h1>
        </div>
        <div className={styles.accessStamp} data-state={access}>
          <span>ACCESS STATE</span>
          <strong>{access}</strong>
          {unlocked && <button type="button" onClick={lock}>Lock records</button>}
        </div>
      </section>

      {!unlocked ? (
        <section className={styles.gate} aria-labelledby="gateTitle" data-state={access}>
          <div>
            <span>SESSION GATE</span>
            <h2 id="gateTitle">{access === "loading" ? "Reading records." : "Unlock pilot records."}</h2>
            <p role={access === "unauthorized" || access === "unavailable" ? "alert" : "status"}>{accessMessage}</p>
          </div>
          <form onSubmit={unlock} className={styles.unlockForm} aria-busy={access === "loading"}>
            <label htmlFor="adminSecret">Pilot admin secret</label>
            <input
              id="adminSecret"
              name="adminSecret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={access === "loading"}
            />
            <button type="submit" disabled={access === "loading" || !secret}>
              {access === "loading" ? "Loading records" : "Unlock records"}
            </button>
            <p>The secret stays in React memory for this mounted page. Recoder does not put it in the URL, cookies, browser storage, or logs.</p>
          </form>
        </section>
      ) : records ? (
        <>
          <section className={styles.chain} aria-labelledby="chainTitle">
            <div className={styles.sectionTitle}>
              <span>SERVER RECORD CHAIN</span>
              <h2 id="chainTitle">Intake to public aggregate.</h2>
              <p>{cancelled} cancelled pilots remain private operational records.</p>
            </div>
            <ol>
              <li><span>01 / INTAKE</span><strong>{records.leadRefs.length}</strong><p>Bounded lead refs</p></li>
              <li><span>02 / STARTED</span><strong>{started}</strong><p>Active pilots</p></li>
              <li><span>03 / COMPLETED</span><strong>{completed}</strong><p>Awaiting review</p></li>
              <li><span>04 / VERIFIED</span><strong>{verified}</strong><p>Reviewed outcomes</p></li>
              <li><span>05 / PUBLIC</span><Link href="/proof">Open aggregate</Link><p>No private IDs</p></li>
            </ol>
          </section>

          <section className={styles.setup}>
            <div className={styles.leads}>
              <div className={styles.sectionTitle}>
                <span>PRIVATE LEAD REFS</span>
                <h2>Choose a real intake.</h2>
              </div>
              {records.leadRefs.length === 0 ? (
                <p className={styles.empty}>No design-partner lead refs are recorded.</p>
              ) : (
                <ol>
                  {records.leadRefs.map((lead) => (
                    <li key={lead.id}><code>{lead.id}</code><time dateTime={lead.createdAt}>{formatUtc(lead.createdAt)}</time></li>
                  ))}
                </ol>
              )}
            </div>

            <form className={styles.createForm} onSubmit={createPilot} aria-labelledby="createTitle">
              <div className={styles.sectionTitle}>
                <span>START PILOT</span>
                <h2 id="createTitle">Record baseline and target.</h2>
              </div>
              <label>Design-partner lead
                <select name="designPartnerLeadId" required defaultValue="" disabled={busy || records.leadRefs.length === 0}>
                  <option value="" disabled>Select a lead ref</option>
                  {records.leadRefs.map((lead) => <option value={lead.id} key={lead.id}>{lead.id}</option>)}
                </select>
              </label>
              <label>Measure<input name="metricName" required maxLength={120} disabled={busy} /></label>
              <label>Unit<input name="metricUnit" required maxLength={40} disabled={busy} /></label>
              <label>Direction
                <select name="metricDirection" required defaultValue="decrease" disabled={busy}>
                  {DIRECTIONS.map((direction) => <option value={direction.value} key={direction.value}>{direction.label}</option>)}
                </select>
              </label>
              <label>Baseline<input name="baselineValue" type="number" step="any" required disabled={busy} /></label>
              <label>Target<input name="targetValue" type="number" step="any" required disabled={busy} /></label>
              <button type="submit" disabled={busy || records.leadRefs.length === 0}>{busy && operation.key === "create" ? "Starting pilot" : "Start pilot"}</button>
            </form>
          </section>

          <OperationNotice operation={operation} />

          <section className={styles.pilots} aria-labelledby="pilotsTitle">
            <div className={styles.sectionTitle}>
              <span>CURRENT PILOT RECORDS</span>
              <h2 id="pilotsTitle">Operate each transition.</h2>
            </div>
            {records.pilots.length === 0 ? (
              <p className={styles.empty}>No pilots are recorded. Start one from a lead ref.</p>
            ) : (
              <div className={styles.pilotList}>
                {records.pilots.map((pilot) => (
                  <article className={styles.pilot} key={pilot.id}>
                    <header>
                      <div><span>PILOT ID</span><code>{pilot.id}</code></div>
                      <strong data-status={pilot.status}>{pilot.status}</strong>
                    </header>
                    <div className={styles.idChain}>
                      <div><span>INTAKE</span><code>{pilot.designPartnerLeadId}</code></div>
                      <div><span>PILOT</span><code>{pilot.id}</code></div>
                      <div><span>REVISION</span><b>{pilot.revision}</b></div>
                      <div><span>PUBLIC AGGREGATE</span><b>{pilot.status === "verified" ? "ELIGIBLE" : "NOT YET"}</b></div>
                    </div>
                    <dl className={styles.measure}>
                      <div><dt>Measure</dt><dd>{pilot.metricName}</dd></div>
                      <div><dt>Baseline</dt><dd>{pilot.baselineValue} {pilot.metricUnit}</dd></div>
                      <div><dt>Target</dt><dd>{pilot.targetValue} {pilot.metricUnit}</dd></div>
                      <div><dt>Outcome</dt><dd>{pilot.outcomeValue === null ? "NOT RECORDED" : `${pilot.outcomeValue} ${pilot.metricUnit}`}</dd></div>
                    </dl>
                    {pilot.proofUrl && <p className={styles.proofUrl}><span>PUBLIC PROOF URL</span><a href={pilot.proofUrl} target="_blank" rel="noreferrer">{pilot.proofUrl}</a></p>}
                    {pilot.status === "started" && (
                      <form className={styles.completeForm} onSubmit={(event) => completePilot(event, pilot.id)}>
                        <label>Outcome<input name="outcomeValue" type="number" step="any" required disabled={busy} /></label>
                        <label>Public proof URL<input name="proofUrl" type="url" required maxLength={2048} disabled={busy} /></label>
                        <button type="submit" disabled={busy}>{busy && operation.key === `complete:${pilot.id}` ? "Completing pilot" : "Complete pilot"}</button>
                      </form>
                    )}
                    <div className={styles.actions}>
                      {pilot.status === "completed" && <button type="button" disabled={busy} onClick={() => transitionPilot(pilot, "verified")}>{busy && operation.key === `verified:${pilot.id}` ? "Verifying" : "Verify outcome"}</button>}
                      {(pilot.status === "started" || pilot.status === "completed") && <button className={styles.cancel} type="button" disabled={busy} onClick={() => transitionPilot(pilot, "cancelled")}>{busy && operation.key === `cancelled:${pilot.id}` ? "Cancelling" : "Cancel pilot"}</button>}
                    </div>
                    <footer>Updated {formatUtc(pilot.updatedAt)}</footer>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function OperationNotice({ operation }: { operation: Operation }) {
  if (operation.state === "idle") return null;
  return <p className={styles.operation} data-state={operation.state} role={operation.state === "error" ? "alert" : "status"}>{operation.message}</p>;
}

async function loadAdminRecords(secret: string): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetch("/api/admin/pilots", {
      cache: "no-store",
      headers: { authorization: `Bearer ${secret}` },
    });
  } catch {
    return { state: "unavailable", error: "The pilot API could not be reached." };
  }
  const body = await response.json().catch(() => null) as unknown;
  if (response.status === 401) return { state: "unauthorized", error: "The admin secret was rejected." };
  if (!response.ok) {
    return { state: "unavailable", error: readError(body) || "Pilot administration is unavailable." };
  }
  if (!isAdminRecords(body)) {
    return { state: "unavailable", error: "The pilot API returned an invalid record shape." };
  }
  const records = { leadRefs: body.leadRefs, pilots: body.pilots };
  return {
    state: records.leadRefs.length === 0 && records.pilots.length === 0 ? "empty" : "success",
    records,
  };
}

function readError(value: unknown): string {
  if (typeof value !== "object" || value === null || !("error" in value)) return "";
  return typeof value.error === "string" ? value.error : "";
}

function isAdminRecords(value: unknown): value is { success: true; leadRefs: LeadRef[]; pilots: PilotRecord[] } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { success?: unknown; leadRefs?: unknown; pilots?: unknown };
  return record.success === true &&
    Array.isArray(record.leadRefs) && record.leadRefs.every(isLeadRef) &&
    Array.isArray(record.pilots) && record.pilots.every(isPilotRecord);
}

function isLeadRef(value: unknown): value is LeadRef {
  if (typeof value !== "object" || value === null) return false;
  const lead = value as Partial<LeadRef>;
  return typeof lead.id === "string" && lead.id.length > 0 && lead.id.length <= 160 &&
    typeof lead.createdAt === "string" && lead.createdAt.length <= 64;
}

function isPilotRecord(value: unknown): value is PilotRecord {
  if (typeof value !== "object" || value === null) return false;
  const pilot = value as Partial<PilotRecord>;
  return typeof pilot.id === "string" && pilot.id.length > 0 && pilot.id.length <= 160 &&
    typeof pilot.designPartnerLeadId === "string" && pilot.designPartnerLeadId.length > 0 && pilot.designPartnerLeadId.length <= 160 &&
    typeof pilot.metricName === "string" && pilot.metricName.length > 0 && pilot.metricName.length <= 120 &&
    typeof pilot.metricUnit === "string" && pilot.metricUnit.length > 0 && pilot.metricUnit.length <= 40 &&
    ["increase", "decrease", "exact"].includes(pilot.metricDirection || "") &&
    isMeasure(pilot.baselineValue) && isMeasure(pilot.targetValue) &&
    (pilot.outcomeValue === null || isMeasure(pilot.outcomeValue)) &&
    (pilot.proofUrl === null || (typeof pilot.proofUrl === "string" && pilot.proofUrl.length <= 2048)) &&
    ["started", "completed", "verified", "cancelled"].includes(pilot.status || "") &&
    isTimestamp(pilot.startedAt) && isNullableTimestamp(pilot.completedAt) &&
    isNullableTimestamp(pilot.verifiedAt) && isNullableTimestamp(pilot.cancelledAt) &&
    isTimestamp(pilot.createdAt) && isTimestamp(pilot.updatedAt) &&
    Number.isInteger(pilot.revision) && Number(pilot.revision) > 0;
}

function isMeasure(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function formatUtc(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : "INVALID TIME";
}
