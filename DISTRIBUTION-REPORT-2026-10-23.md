# Launch report: Recoder

_Generated 2026-10-23_

Launch tracking started 0 day(s) ago.

## Directories
- 3/24 submitted or live, 21 not started.

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
- **SaaSHub (saashub.com/services/submit): a real, complete, free submission.**
  A follow-up session fixed the headless Chromium install (a stale Playwright
  lockfile from the earlier stalled download) and drove the actual page with a
  real browser: filled the URL, let it auto-crawl name/tagline, selected 3
  categories (AI Coding Assistant, AI Developer Tools, Productivity Tools)
  through the live React category picker, added 3 real competitors (OpenGUI,
  CodeMote, Jackalope) and 6 relevant categories, and submitted on the Free
  tier. Confirmed via the site's own success page: "Recoder was submitted
  successfully" at https://www.saashub.com/recoder/added. Pending moderator
  approval; claiming/managing the listing needs an owner login (same pattern
  as Uneed).

**Investigated and genuinely blocked (not faked):**
- SaaSHub for the other 3 products in this wave (VCPeer, Menivor, Scribase):
  SaaSHub enforces a real anti-abuse limit -- "Please register to submit more
  than one product" -- confirmed live by attempting a second anonymous
  submission from the same session, which the site genuinely blocks (no
  crawl, no form, stuck on the rules page). Recoder used the one free
  anonymous slot available per session; the other 3 need an owner SaaSHub
  account to submit further products. This is a real product limit, not a
  technical gap -- the category picker itself is provably drivable by a real
  browser now.
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