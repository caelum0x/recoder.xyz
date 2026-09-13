"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "./design-partners.module.css";

const AGENTS = ["Claude Code", "Codex", "Cursor", "opencode", "Other"];
const PAINS = [
  ["compare", "Comparing agent output"],
  ["merge", "Merging contested changes"],
  ["governance", "Approval and audit evidence"],
  ["privacy", "Keeping code private"],
  ["cost", "Controlling model cost"],
  ["reliability", "Knowing whether the result works"],
] as const;

type Status = "idle" | "submitting" | "done" | "error";

export default function DesignPartnersPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [agents, setAgents] = useState<string[]>([]);

  function toggleAgent(agent: string) {
    setAgents((current) => current.includes(agent) ? current.filter((item) => item !== agent) : [...current, agent]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (agents.length === 0) {
      setError("Select at least one coding agent.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");
    const payload = {
      kind: "design-partner",
      source: "design-partners",
      email: form.get("email"),
      teamSize: form.get("teamSize"),
      currentAgents: agents,
      deployment: form.get("deployment"),
      primaryPain: form.get("primaryPain"),
      weeklyRuns: form.get("weeklyRuns"),
      evidenceRequired: form.get("evidenceRequired") === "on",
      pilotTiming: form.get("pilotTiming"),
      interviewConsent: form.get("interviewConsent") === "on",
      message: form.get("message"),
      website: form.get("website"),
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || "We could not save your request.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Try again or use the contact page.");
      setStatus("error");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">RECODER</Link>
        <span>DESIGN PARTNER PROGRAM / 2026</span>
      </header>

      <section className={styles.hero}>
        <p>For teams already using coding agents</p>
        <h1>N agents.<br />One trusted merge.</h1>
        <div className={styles.stamp}>3–5 pilot teams</div>
      </section>

      <section className={styles.contract}>
        <h2>The pilot contract</h2>
        <ol>
          <li><b>01</b><span>You bring one real repository and one repeated task.</span></li>
          <li><b>02</b><span>Recoder runs competing agents in isolated worktrees.</span></li>
          <li><b>03</b><span>Your reviewer compares, approves, and exports signed evidence.</span></li>
          <li><b>04</b><span>We measure review time, rejected changes, and time to merge.</span></li>
        </ol>
      </section>

      <section className={styles.intake}>
        <div className={styles.intakeTitle}>
          <span>FIT CHECK</span>
          <h2>Tell us how your team ships agent-written code.</h2>
          <p>This is a product-fit intake, not a waitlist. We use the answers to select hands-on pilots and shape the first paid deployment.</p>
        </div>

        {status === "done" ? (
          <div className={styles.done} role="status">
            <strong>Request recorded.</strong>
            <p>This intake does not start a pilot. A selected team receives a separate pilot record with a baseline and target.</p>
            <p>We will reply by email with a fit decision or one focused follow-up.</p>
            <Link href="/how-it-works">Review the product loop</Link>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <input name="website" className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden />
            <label>Email<input name="email" type="email" required placeholder="you@company.com" /></label>
            <label>Engineering team size
              <select name="teamSize" required defaultValue="">
                <option value="" disabled>Select</option><option value="1">1</option><option value="2-10">2–10</option><option value="11-50">11–50</option><option value="51-200">51–200</option><option value="201+">201+</option>
              </select>
            </label>
            <fieldset className={styles.full}>
              <legend>Coding agents in active use</legend>
              <div className={styles.choices}>{AGENTS.map((agent) => <button type="button" className={agents.includes(agent) ? styles.active : ""} onClick={() => toggleAgent(agent)} key={agent}>{agent}</button>)}</div>
            </fieldset>
            <label>Where agents run
              <select name="deployment" required defaultValue=""><option value="" disabled>Select</option><option value="local">Local or self-hosted</option><option value="cloud">Cloud</option><option value="both">Both</option></select>
            </label>
            <label>Agent runs per week
              <select name="weeklyRuns" required defaultValue=""><option value="" disabled>Select</option><option value="0-5">0–5</option><option value="6-20">6–20</option><option value="21-100">21–100</option><option value="101+">101+</option></select>
            </label>
            <fieldset className={styles.full}>
              <legend>Primary bottleneck</legend>
              <div className={styles.radioGrid}>{PAINS.map(([value, label]) => <label key={value}><input type="radio" name="primaryPain" value={value} required /><span>{label}</span></label>)}</div>
            </fieldset>
            <label>Pilot timing
              <select name="pilotTiming" required defaultValue=""><option value="" disabled>Select</option><option value="now">Ready now</option><option value="30-days">Within 30 days</option><option value="quarter">This quarter</option><option value="research">Research only</option></select>
            </label>
            <div className={styles.checks}>
              <label><input name="evidenceRequired" type="checkbox" />We need audit or compliance evidence.</label>
              <label><input name="interviewConsent" type="checkbox" />I can join a 30-minute product interview.</label>
            </div>
            <label className={styles.full}>One workflow you want to improve<textarea name="message" rows={4} maxLength={2000} placeholder="Task, current process, and where it breaks." /></label>
            {status === "error" && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Recording…" : "Request a pilot"}</button>
            <p className={styles.privacy}>By submitting, you agree to the <Link href="/privacy">Privacy Policy</Link>. We only use this data for this request and product research.</p>
          </form>
        )}
      </section>
    </main>
  );
}
