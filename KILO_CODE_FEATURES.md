# Kilo Code Features to Copy to Recoder

> Reference: `/Users/arhansubasi/recoder.xyz/kilocode/` (Apache-2.0 licensed)

## Priority Order

### 1. Parallel Execution (CLI)
**Source:** `kilocode/cli/src/parallel/`
- `parallel.ts` - Git worktree-based parallel mode
- `determineBranch.ts` - Branch naming and worktree setup

**Key Features:**
- Creates git worktrees for parallel task execution
- Auto-commits with conventional commit messages
- Agent generates commit message from diff
- Supports `--existing-branch` to resume work

**Copy to:** `recoder-code/packages/core/src/parallel/`

---

### 2. Search & Replace Tool (str_replace)
**Source:** `kilocode/src/core/tools/SearchReplaceTool.ts`

**Key Features:**
- Targeted edits instead of full file rewrites
- Validates old_string exists and is unique
- Handles path resolution (absolute/relative)
- Write protection support

**Copy to:** `recoder-web/app/lib/.server/llm/tools/` and `recoder-code/`

---

### 3. Ghost Service (Inline Autocomplete)
**Source:** `kilocode/src/services/ghost/`
- `GhostServiceManager.ts` - Singleton manager
- `GhostModel.ts` - Model for completions
- `GhostInlineCompletionProvider.ts` - VSCode provider
- `classic-auto-complete/` - Full implementation

**Key Features:**
- Inline ghost text completions
- Cost tracking per session
- Snooze timer support
- Code action provider integration

**Copy to:** `recoder-web/app/components/editor/` (adapt for Monaco)

---

### 4. CLI Commands System
**Source:** `kilocode/cli/src/commands/`

| Command | File | Purpose |
|---------|------|---------|
| mode | `mode.ts` | Switch AI modes (Architect/Code/Ask/Debug) |
| model | `model.ts` | Model selection and config |
| session | `session.ts` | Session management |
| checkpoint | `checkpoint.ts` | Git checkpoint system |
| tasks | `tasks.ts` | Task management |
| condense | `condense.ts` | Context condensation |

**Core System:**
- `core/parser.ts` - Command parsing
- `core/types.ts` - Type definitions
- `core/registry.ts` - Command registration

**Copy to:** `recoder-code/packages/cli/src/commands/`

---

### 5. Cloud Service
**Source:** `kilocode/packages/cloud/src/`
- `CloudService.ts` - Main cloud integration
- `CloudAPI.ts` - API client
- `CloudSettingsService.ts` - Settings sync
- `CloudShareService.ts` - Task sharing
- `TelemetryClient.ts` - Usage tracking
- `bridge/` - Extension-cloud communication

**Copy to:** `recoder-web/app/lib/services/cloud/`

---

### 6. Core Tools
**Source:** `kilocode/src/core/tools/`

| Tool | Purpose |
|------|---------|
| `ReadFileTool.ts` | Smart file reading with line ranges |
| `EditFileTool.ts` | Full file editing |
| `SearchReplaceTool.ts` | Targeted str_replace |
| `ExecuteCommandTool.ts` | Shell command execution |
| `BrowserActionTool.ts` | Browser automation |
| `CodebaseSearchTool.ts` | Semantic code search |
| `ApplyDiffTool.ts` | Apply unified diffs |
| `MultiApplyDiffTool.ts` | Multi-file diffs |
| `NewTaskTool.ts` | Spawn subtasks |
| `SwitchModeTool.ts` | Mode switching |

**Copy to:** `recoder-web/app/lib/.server/llm/tools/` and `recoder-code/`

---

### 7. Services
**Source:** `kilocode/src/services/`

| Service | Purpose |
|---------|---------|
| `tree-sitter/` | Code parsing and analysis |
| `code-index/` | Codebase indexing and search |
| `mcp/` | Model Context Protocol hub |
| `checkpoints/` | Shadow checkpoint system |
| `ripgrep/` | Fast file search |
| `browser/` | Browser session management |
| `commit-message/` | AI commit message generation |
| `marketplace/` | Extension marketplace |

---

### 8. API Providers
**Source:** `kilocode/src/api/providers/`
- Multiple provider implementations
- Bedrock, Anthropic Vertex, Ollama, etc.
- Base provider pattern

---

### 9. Communication (IPC)
**Source:** `kilocode/cli/src/communication/ipc.ts`
- Inter-process communication for CLI

---

### 10. Integrations
**Source:** `kilocode/src/integrations/`
- External service integrations

---

## Implementation Order

```
Phase 1: Core Tools
├── SearchReplaceTool (str_replace)
├── ReadFileTool improvements
└── ExecuteCommandTool

Phase 2: Parallel Execution
├── parallel.ts
├── determineBranch.ts
└── Git worktree integration

Phase 3: Ghost/Autocomplete
├── GhostServiceManager
├── Adapt for Monaco editor
└── Cost tracking

Phase 4: CLI Commands
├── Command registry
├── Mode switching
└── Session management

Phase 5: Cloud & Services
├── CloudService
├── Checkpoints
└── Code indexing
```

## File Mapping

| Kilo Source | Recoder Target |
|-------------|----------------|
| `cli/src/parallel/` | `recoder-code/packages/core/src/parallel/` |
| `cli/src/commands/` | `recoder-code/packages/cli/src/commands/` |
| `src/core/tools/` | `recoder-web/app/lib/.server/llm/tools/` |
| `src/services/ghost/` | `recoder-web/app/components/editor/ghost/` |
| `packages/cloud/` | `recoder-web/app/lib/services/cloud/` |
| `src/services/` | `recoder-code/packages/core/src/services/` |

## Notes

- Kilo Code is Apache-2.0 licensed - can copy/adapt freely
- Focus on str_replace tool first - biggest AI quality improvement
- Ghost service needs Monaco adapter (Kilo uses VSCode API)
- Parallel mode requires git worktree support
