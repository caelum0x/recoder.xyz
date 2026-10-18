# Launch copy — Recoder

Drafts only. Nothing here has been posted. Product Hunt / Show HN / Reddit /
X / LinkedIn all require the owner's own login to post — paste these in
directly when ready. Audience is developers, small engineering teams and
founders who ship code — never "indie hackers" wording.

Context for whoever posts these: recoder.xyz is live (200), and the
3-month auth outage is fixed and verified live (`/api/auth/get-session` →
200). Social sign-in (GitHub/Google) still needs the owner to create real
OAuth app credentials before "Continue with GitHub/Google" fully works end
to end — see `docs/growth/` and `GROWTH-BLOCKERS-2026-10-18.md` for that
runbook. The CLI (`npx recoder-code@latest`) needs no login at all and
works today, so lead with that if OAuth isn't fixed yet when this posts.

---

## Product Hunt

**Tagline (60 char max):** Run N AI coding agents in parallel, merge the best

**Description:**
Recoder runs Claude Code, Codex, Cursor and opencode side by side, each in
its own isolated git worktree, so you get options instead of one shot per
task. Compare every agent's diff, converge the best result (automatic for
clean files, your call on contested ones), and merge through a governance
gate that produces a signed, tamper-evident evidence record — mapped to
SOC 2 / EU AI Act / DORA controls, not just a passing CI check. Self-hosted
and BYOK: your infrastructure, your model keys, your code. Local agents run
with zero account required. Try the same parallel-worktree idea from the
terminal today with the free CLI: `npx recoder-code@latest`.

---

## Show HN

**Title (80 char limit, HN format):**
Show HN: Recoder – run N AI coding agents in parallel, merge the best diff

**Body:**
Hi HN — I built Recoder because running one AI coding agent on a task gives
you exactly one attempt, and if it's wrong you're stuck manually diffing
and re-prompting. Recoder runs several agents (Claude Code, Codex, Cursor,
opencode) on the same task in parallel, each in its own isolated git
worktree so they never collide. You get a side-by-side diff view, an N→1
convergence step that auto-merges non-contested files and asks you to pick
on contested ones, and a governance gate on every merge that emits a
content-hashed, Ed25519-signable evidence record of what ran, what was
decided, and how it was verified.

It's self-hosted and BYOK — runs on your own infra with your own model
keys, and local agent runs work with zero account. There's also a free CLI
on npm if you don't want to install the desktop app yet:
`npx recoder-code@latest`, including a `parallel` mode that mirrors the
same git-worktree-per-agent approach from the terminal.

Source and docs: https://github.com/caelum0x/recoder.xyz
Site: https://recoder.xyz

Happy to answer questions about the worktree isolation model, the
convergence/merge algorithm, or the evidence format.

---

## X / Twitter thread (6 tweets)

**1/6**
Running one AI coding agent on a task gives you one attempt.
Running five gives you options — if you can actually compare and merge them.

That's what Recoder does. 🧵

**2/6**
Point it at a repo, describe a task, launch Claude Code + Codex + Cursor +
opencode at once. Each one runs in its own isolated git worktree — they
never step on each other, and you never lose a partial result from one run
because another agent touched the same files.

**3/6**
Then you get a real side-by-side diff view. Not a merge conflict in your
editor — a clean comparison of what each agent actually produced, file by
file.

**4/6**
Converge the best result: non-contested files merge automatically, you
pick the winner on anything contested. Then it goes through a governance
gate before it ever touches git or your remote — a denied action never
lands.

**5/6**
Every merge emits a signed, content-hashed evidence record — the task, the
candidate diffs, the verdict, the verification — mapped to SOC 2 / EU AI
Act / DORA controls. Useful the moment someone asks "what did the AI
actually change and who approved it."

**6/6**
Self-hosted, BYOK, your own infra and model keys. Local agents run with
zero account needed.
Desktop app: https://recoder.xyz/download
Or try the CLI today, no install: `npx recoder-code@latest`

---

## Reddit (r/webdev or r/programming — problem-first post)

**Title:** Tired of babysitting one AI coding agent's output? I built a tool
that runs several in parallel and merges the best diff.

**Body:**
Anyone else run an AI coding agent on a real task, get a mediocre diff, and
have no good way to compare it against "what if a different agent/model
had tried this"? That was my problem — one agent, one attempt, and if it's
wrong you're re-prompting from scratch with no real alternative to compare
against.

I built Recoder to fix that: it runs multiple AI coding agents (Claude
Code, Codex, Cursor, opencode) on the same task in parallel, each in its
own isolated git worktree so they don't collide. You get a side-by-side
diff of every agent's attempt, a convergence step that auto-merges the
non-contested files and lets you pick on the contested ones, and a
governance gate on every merge that writes a signed evidence record of
what happened — which matters if you ever need to show what an AI agent
actually changed and who signed off.

It's self-hosted and BYOK (bring your own model keys) — runs on your own
infra, local runs need no account. There's a free CLI if you want to try
the idea without installing the desktop app: `npx recoder-code@latest`
(it has a `parallel` subcommand that does the same git-worktree-per-agent
thing from the terminal).

Repo: https://github.com/caelum0x/recoder.xyz
Site: https://recoder.xyz

Genuinely curious how other people are handling "which AI agent's output do
I trust" right now — curious what's working for you.

---

## LinkedIn (build-in-public style)

Three months ago, signup on recoder.xyz was silently broken — every
sign-in attempt returned a 503. Today it's fixed and live in production,
and the project itself is at a point worth talking about properly.

Recoder is a self-hosted desktop app for running multiple AI coding agents
(Claude Code, Codex, Cursor, opencode) in parallel on the same task, each
in its own isolated git worktree. Instead of betting on one agent's single
attempt, you compare diffs side by side, converge on the best result, and
merge it through a governance gate that produces a signed, auditable
evidence record — built with SOC 2 / EU AI Act / DORA controls in mind,
because "an AI changed this code" is a sentence that increasingly needs a
paper trail behind it.

It's self-hosted and BYOK, so your code and your model keys stay on your
own infrastructure. If you lead an engineering team evaluating AI coding
agents and want more than a single-shot prompt-and-pray workflow, I'd love
feedback: https://recoder.xyz

There's also a free CLI on npm if you want to try the parallel-agent idea
without installing anything: `npx recoder-code@latest`.
