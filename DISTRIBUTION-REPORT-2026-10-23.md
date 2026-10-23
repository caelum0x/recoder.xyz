# Launch report: Recoder

_Generated 2026-10-23_

Launch tracking started 0 day(s) ago.

## Directories
- 2/24 submitted or live, 22 not started.

## Checklist
- 1/10 of the 10-step playbook done.

## Outreach
- No contacts tracked yet.

## Content drafted
- 5 launch-copy draft(s) generated.

## UTM links generated
- 24 tracked link(s).

---

## What's actually real (2026-10-23 distribution push)

Context: recoder.xyz had 5 visits in the last 24h despite real engineering
investment. Homepage audit (curl, no JS): title/description/H1 all correctly
say "Recoder -- Run AI Coding Agents in Parallel" with a clear parallel-agents
pitch -- the homepage is NOT the problem; distribution is.

**Real, completed submissions (no account needed):**
- Launching Next: real form POST to https://www.launchingnext.com/submit/
  (math captcha, no account) -- confirmed via "Submission Received" page,
  submission id 165925 (https://www.launchingnext.com/thanks/?i=165925)
- GitHub awesome-lists, real open PRs from caelum0x (not yet merged):
  - https://github.com/devtoolsd/awesome-devtools/pull/450 (AI Coding Tools)
  - https://github.com/e2b-dev/awesome-ai-agents/pull/1789 (commercial AI agents list)

**Investigated and genuinely blocked (not faked):**
- SaaSHub (saashub.com/submit): same product applies across all 4 products in
  this wave -- the real submission flow needs a client-side React category
  picker (confirmed its backing API, `/api/autocomplete/categories`) that a
  plain HTTP POST cannot drive without executing page JS. A local headless
  Chromium install was attempted this session and the download stalled.
- Reddit pain-point search (`launchmaxxing pain-points`): Reddit's
  search.json endpoints returned HTTP 403 "Blocked" to every request from
  this machine's network -- a network-level block, not a tool bug. No
  fabricated thread links are included as a result.
- Product Hunt, BetaList, DevHunt, Fazier, Turbo0, Smol Launch, StartupBase,
  Findly Tools, PeerPush, TinyLaunch, Peerlist, Hacker News, Indie Hackers,
  AlternativeTo, G2, Capterra, Futurepedia, There's An AI For That,
  Microlaunch, r/SideProject -- all genuinely require a login/account to
  finish a submission. Launch copy for all of these is generated and saved
  locally (`launchmaxxing content "Recoder" all --save`) so the owner can
  paste and post in minutes once logged in -- includes a Show HN title that
  correctly leads with "the terminal, not the agents," matching recoder.xyz's
  own homepage framing.

**UTM-tagged links:** 24 built and saved (`launchmaxxing utm list "Recoder"`),
one per catalog directory, so any traffic that comes in is attributable.

_Report generated locally by [launchmaxxing](https://github.com/caelum0x/launchmaxxing) -- no data leaves your machine._