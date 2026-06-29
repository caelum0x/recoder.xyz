# Recoder — Security Incidents

> Append-only incident log. **IOCs and defenses only — never server credentials,
> keys, tokens, or internal infra topology.** External indicators (mining-pool
> address, file hashes) are recorded *because* they are indicators of compromise to
> block and hunt for, not as anything secret.
>
> Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 resolved/contained.

---

## INC-001 — Recurring XMRig cryptominer 🟠 (contained, watchdogged)

**Status:** contained — pool blocked at the firewall + a fixed watchdog removes any
re-drop. **Recurring:** the dropper has returned more than once, so this is treated
as an ongoing hunt, not a one-off cleanup.

### Summary

An XMRig Monero cryptominer was repeatedly dropped onto the production host and
executed from inside the `recoder-app` Next.js build output (`.next`), masquerading
as part of the app so it survives a casual `ps`/`ls` glance. It connects out to an
external Monero mining pool to monetize the box's CPU.

### Indicators of Compromise (IOCs)

| Type | Indicator | Notes |
|------|-----------|-------|
| Mining pool | `45.196.97.119` | XMRig stratum pool endpoint — outbound connections to this host indicate active mining. Block at egress. |
| File hash | `7d60…` | XMRig dropper/binary (prefix of the recorded hash). |
| File hash | `aa0c…` | Second observed variant/component (prefix of the recorded hash). |
| Drop location | `recoder-app` `.next/` build output | The miner is staged inside the deployed Next build dir to blend in with legit app files. |
| Behavior | Sustained ~100% CPU + outbound stratum traffic to the pool IP | First visible symptom; correlate with the pool IP above. |

> The hashes are recorded as truncated prefixes here on purpose. The full hashes
> live with the host's incident artifacts, not in the repo. Treat any binary in a
> `.next` tree whose hash starts with these prefixes as malicious.

### Suspected vector

1. **Exposed Qdrant on `:6333`** — an unauthenticated/over-exposed Qdrant vector-DB
   port reachable from the internet, usable for code execution / file write on the
   host. (Vector DBs are a known mass-scan target.)
2. **Supply-chain on deploy** — a tainted dependency or deploy-time step that writes
   into the build output, which is then executed when the app/build runs. This
   explains why the miner reappears specifically inside `recoder-app/.next`.

Neither vector is confirmed as the sole entry; both are being closed.

### Defenses in place

1. **Egress block on the mining pool** — `iptables` drops outbound traffic to the
   pool IP, so even a freshly dropped miner cannot reach its pool and earn:

   ```bash
   # Block the XMRig pool endpoint (egress). Persist via your iptables-save flow.
   iptables -A OUTPUT -d 45.196.97.119 -j DROP
   ```

2. **Watchdog** — a fixed monitor at `/usr/local/bin/recoder-miner-monitor.sh` runs
   on a schedule. It hunts for the miner (high-CPU non-app processes, binaries in
   `.next` matching the IOC hashes, and connections to the pool IP), kills the
   process, removes the dropped file, and logs the event. The "fixed" qualifier
   matters: an earlier version of this watchdog had a bug that let the miner slip
   through; the corrected script is the one at the path above.

### Hardening / follow-ups (close the vector, don't just sweep)

- [ ] **Lock down Qdrant `:6333`** — bind to loopback / private network only, never
      expose to `0.0.0.0`; require auth; firewall the port. (Primary suspected entry.)
- [ ] **Integrity-check build output on deploy** — fail the deploy if `.next`
      contains executables or files not produced by the build (detects supply-chain
      / post-build drops).
- [ ] **Pin + audit deploy-time dependencies** — lockfile-verified installs; no
      network-fetched build steps that can write arbitrary files.
- [ ] **Egress allow-listing** — default-deny outbound from the app host so a future
      miner with a *different* pool IP still cannot phone home.
- [ ] **Periodic IOC sweep** — keep the watchdog's hash list current as new variants
      appear; alert (not just clean) on every hit so recurrence is visible.

### What this incident is NOT

- Not a data-exfiltration or ransomware event as far as observed — the payload is a
  resource-theft cryptominer (CPU for Monero), though the same access vector could
  be used for worse, which is why the vector itself must be closed.
- The miner's presence inside `recoder-app/.next` does **not** mean the app code is
  malicious; the build output is the *hiding place*, not the source.
