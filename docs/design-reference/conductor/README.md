# Conductor Design Reference

Screenshots of Conductor (conductor.build) macOS app, captured 2026-07-25. Competitor reference for the Recoder desktop cockpit — same product space (parallel coding-agent workspaces over git worktrees).

| File | Surface | Notes |
| --- | --- | --- |
| `conductor-01-home-open-project.png` | Home / empty state | Left sidebar (profile, Create, Search, Workspaces, Projects list), giant dot-matrix wordmark, three entry cards: Open project / Open GitHub project / Quick start. Gamified "4/382 cities visited" footer. Bottom-left contextual tip (macOS full disk access), bottom-right update toast. |
| `conductor-02-clone-github-repo-modal.png` | Clone GitHub repo modal | Centered modal over dimmed app: Repository URL input, "Recent repos" list with org avatars, Location picker with Browse, primary "Clone repo ⌘↩" button. |
| `conductor-03-command-palette.png` | Command palette (⌘K) | Actions list with icons + shortcut hints: Create workspace ⌘N, Add project, Toggle theme, Toggle left/right sidebar, Zen mode, Send feedback, Submit a prompt, Show keyboard shortcuts. |
| `conductor-04-workspaces-list.png` | Workspaces list | Filter input + Project / Show dropdowns, workspaces grouped by age ("1 week ago 4"), each row: project icon + branch icon + task title, relative age right-aligned, hover shows "Go to →". |

Takeaways worth stealing: one-line workspace rows grouped by recency, entry cards instead of blank empty state, shortcut hints everywhere, quiet single-accent dark palette.
