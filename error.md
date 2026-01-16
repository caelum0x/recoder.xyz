# Recoder.xyz Implementation Plan

**Created:** January 15, 2026
**Source:** Kilo Code (Apache-2.0 License) - `/Users/arhansubasi/recoder.xyz/kilocode`
---
> '/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/code_assist''/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/subagents''/Users/arhansubasi/recoder.xyz/packages/recoder-code/packages/core/src/services' copy these to recoder web lib .server llm folder we can use these too I already copied tools

## 🎯 Most Valuable Parts to Copy

| Directory | What It Has | Copy Priority |
|-----------|-------------|---------------|
| src/core/prompts/ | System prompts, mode prompts | 🔴 HIGH |
| src/shared/modes.ts | Architect/Coder/Debugger modes | 🔴 HIGH |
| src/core/tools/ | 33 tools (grep, edit, read, etc.) | 🔴 HIGH |
| src/services/ghost/ | Inline autocomplete (ghost text) | 🔴 HIGH |
| src/services/ripgrep/ | Search implementation | 🟡 MEDIUM |
| cli/src/ | CLI implementation | 🟡 MEDIUM |
| src/core/auto-approval/ | Auto-approve safe actions | 🟡 MEDIUM |
| src/services/marketplace/ | MCP marketplace | 🟢 LATER | ---
Location: /Users/arhansubasi/recoder.xyz/kilocode

### High Priority (Copy Now)

| File/Dir | What It Has | Use For |
|----------|-------------|---------|
| packages/types/src/mode.ts | 5 mode definitions (Architect, Code, Ask, Debug, Orchestrator) | 
Multi-mode system |
| src/core/prompts/ | System prompts per mode | Better AI behavior |
| src/services/ghost/ | Ghost text autocomplete | Inline completions |
| src/core/tools/ | 33 tools (grep, edit, read, etc.) | Agentic capabilities |

### Key Insights from Kilo

1. Debug Mode has special instructions:
  > "Reflect on 5-7 different possible sources of the problem, distill those down to 1-2 most 
likely sources, and then add logs to validate your assumptions."

2. Architect Mode is read-only except for .md files - forces planning before coding

3. Tool Groups control what each mode can do:
   - read - file reading
   - edit - file editing
   - browser - web access
   - command - shell commands
   - mcp - MCP servers

4. Orchestrator delegates to other modes using new_task tool--
---

## 🎯 Phase 1: Multi-Mode System (Priority: HIGH)

### Goal
Implement Architect/Code/Ask/Debug/Orchestrator modes like Kilo Code

### Files to Copy from Kilo

| Source File | Target Location | Purpose |
|-------------|-----------------|---------|
| `kilocode/packages/types/src/mode.ts` | `recoder-web/app/lib/modes/types.ts` | Mode type definitions |
| `kilocode/packages/types/src/tool.ts` | `recoder-web/app/lib/modes/tools.ts` | Tool group definitions |
| `kilocode/src/shared/modes.ts` | `recoder-web/app/lib/modes/index.ts` | Mode helpers |

### Implementation Steps

```
1. Create recoder-web/app/lib/modes/ directory
2. Copy and adapt mode types from Kilo
3. Create mode selector UI component
4. Update system prompt to use mode-specific prompts
5. Restrict tools based on current mode
```

### Mode Definitions to Implement

```typescript
// recoder-web/app/lib/modes/types.ts
export const MODES = {
  architect: {
    name: "Architect",
    icon: "i-ph:blueprint",
    description: "Plan and design before implementation",
    tools: ["read", "browser", "mcp"],
    editRestriction: /\.md$/,  // Only markdown files
    systemPrompt: `You are Recoder in Architect mode. Your goal is to:
1. Gather information about the task
2. Ask clarifying questions
3. Create a detailed plan in a markdown file
4. Do NOT write code - only plan

Use readFile and listFiles to explore. Create plans in /plans directory.`
  },
  code: {
    name: "Code", 
    icon: "i-ph:code",
    description: "Write, modify, and refactor code",
    tools: ["read", "edit", "browser", "command", "mcp"],
    systemPrompt: `You are Recoder in Code mode. You can:
- Read and write any files
- Run shell commands
- Implement features and fix bugs

Always explore the codebase first before making changes.`
  },
  ask: {
    name: "Ask",
    icon: "i-ph:question",
    description: "Get answers and explanations",
    tools: ["read", "browser", "mcp"],
    systemPrompt: `You are Recoder in Ask mode. You can:
- Answer questions about code
- Explain concepts
- Analyze existing code

Do NOT make changes unless explicitly asked.`
  },
  debug: {
    name: "Debug",
    icon: "i-ph:bug",
    description: "Diagnose and fix software issues",
    tools: ["read", "edit", "browser", "command", "mcp"],
    systemPrompt: `You are Recoder in Debug mode. Follow this process:
1. Reflect on 5-7 possible sources of the problem
2. Distill to 1-2 most likely causes
3. Add logs to validate assumptions
4. Ask user to confirm diagnosis
5. Only then fix the problem

ALWAYS explore error files and logs first.`
  },
  orchestrator: {
    name: "Orchestrator",
    icon: "i-ph:flow-arrow",
    description: "Coordinate complex multi-step tasks",
    tools: ["delegate"],
    systemPrompt: `You are Recoder in Orchestrator mode. You:
- Break complex tasks into subtasks
- Delegate to appropriate modes
- Track progress across subtasks
- Synthesize results

Use new_task tool to delegate work.`
  }
}
```

### UI Component

```typescript
// recoder-web/app/components/chat/ModeSelector.tsx
// Copy pattern from: kilocode/webview-ui/src/components/chat/ModeSelector.tsx
```

---

## 🎯 Phase 2: Agentic Tools System (Priority: HIGH)

### Goal
Implement proper read/edit/grep/search tools like Kilo Code

### Files to Copy from Kilo

| Source File | Target Location | Purpose |
|-------------|-----------------|---------|
| `kilocode/src/core/tools/` | `recoder-web/app/lib/tools/` | Tool implementations |
| `kilocode/src/services/ripgrep/` | `recoder-web/app/lib/tools/ripgrep.ts` | Search implementation |
| `kilocode/src/shared/tools.ts` | `recoder-web/app/lib/tools/registry.ts` | Tool registry |

### Tools to Implement

| Tool | Kilo Source | Description |
|------|-------------|-------------|
| `read_file` | `src/core/tools/read-file.ts` | Read file contents |
| `write_file` | `src/core/tools/write-file.ts` | Write/create files |
| `edit_file` | `src/core/tools/edit-file.ts` | Edit specific lines (str_replace) |
| `list_files` | `src/core/tools/list-files.ts` | List directory contents |
| `search_files` | `src/core/tools/search-files.ts` | Ripgrep search |
| `execute_command` | `src/core/tools/execute-command.ts` | Run shell commands |
| `browser_action` | `src/core/tools/browser-action.ts` | Web browsing |
| `update_todo_list` | `src/core/tools/update-todo-list.ts` | Task tracking |
| `new_task` | `src/core/tools/new-task.ts` | Delegate to modes |
| `attempt_completion` | `src/core/tools/attempt-completion.ts` | Mark task done |

### Key Improvement: str_replace Edit

```typescript
// Current recoder-web: Regenerates entire file
// Kilo approach: Edit specific lines

// kilocode/src/core/tools/edit-file.ts pattern:
interface EditFileParams {
  path: string;
  old_str: string;  // Exact string to find
  new_str: string;  // Replacement string
}

// This is what Cursor/Copilot do - targeted edits, not full regeneration
```

---

## 🎯 Phase 3: Inline Autocomplete (Priority: HIGH)

### Goal
Ghost text suggestions while typing (like Copilot)

### Files to Copy from Kilo

| Source File | Target Location | Purpose |
|-------------|-----------------|---------|
| `kilocode/src/services/ghost/` | `recoder-web/app/lib/autocomplete/` | Ghost text service |
| `kilocode/src/test-llm-autocompletion/` | Reference | Test cases |

### Implementation Steps

```
1. Create autocomplete service that watches editor changes
2. Debounce requests (200ms delay)
3. Send context (surrounding code) to AI
4. Display ghost text in Monaco editor
5. Tab to accept, Escape to dismiss
```

### Monaco Integration

```typescript
// recoder-web/app/components/editor/InlineCompletion.tsx
import * as monaco from 'monaco-editor';

// Register inline completion provider
monaco.languages.registerInlineCompletionsProvider('*', {
  provideInlineCompletions: async (model, position, context, token) => {
    // Get surrounding code context
    const prefix = model.getValueInRange({
      startLineNumber: Math.max(1, position.lineNumber - 10),
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    });
    
    // Call AI for completion
    const completion = await getAICompletion(prefix);
    
    return {
      items: [{ insertText: completion }]
    };
  }
});
```

---

## 🎯 Phase 4: Debug Mode Auto-Fix (Priority: HIGH)

### Goal
Automatically detect errors and fix them like Cursor

### Current State
- ProblemsPanel shows errors ✅
- "Fix with AI" button exists ✅
- AI doesn't explore first ❌
- AI regenerates everything ❌

### Implementation from Kilo

```typescript
// Debug mode workflow from kilocode/packages/types/src/mode.ts:
// "Reflect on 5-7 different possible sources of the problem,
//  distill those down to 1-2 most likely sources,
//  and then add logs to validate your assumptions.
//  Explicitly ask the user to confirm the diagnosis before fixing."

// Implementation:
1. When error detected, switch to Debug mode
2. Force AI to use readFile on error file
3. Force AI to use searchFiles for related code
4. AI proposes diagnosis (not fix)
5. User confirms
6. AI makes targeted fix with edit_file (str_replace)
7. Run npm run dev to verify
```

### Auto-Error Detection Loop

```typescript
// recoder-web/app/lib/services/auto-debug.ts
export async function autoDebugLoop(errors: BuildError[]) {
  // 1. Switch to debug mode
  setMode('debug');
  
  // 2. For each error, create exploration plan
  for (const error of errors) {
    // Force read the error file
    await executeAction({ type: 'readFile', filePath: error.filePath });
    
    // Search for related code
    if (error.message.includes('import')) {
      await executeAction({ 
        type: 'searchFiles', 
        query: extractImportName(error.message) 
      });
    }
  }
  
  // 3. AI analyzes and proposes fix
  // 4. User confirms
  // 5. AI applies targeted fix
}
```

---

## 🎯 Phase 5: CLI Integration (Priority: MEDIUM)

### Goal
Integrate recoder-code CLI features into recoder-web

### Files to Copy from Kilo CLI

| Source File | Target Location | Purpose |
|-------------|-----------------|---------|
| `kilocode/cli/src/cli.ts` | Reference | CLI structure |
| `kilocode/cli/src/commands/` | `recoder-code/packages/cli/src/commands/` | Command implementations |
| `kilocode/cli/src/ui/` | Reference | Terminal UI |

### Shared Core

```
recoder-code-core (already exists)
├── tools/          # Same tools as web
├── prompts/        # Same prompts as web  
├── modes/          # Same modes as web
└── providers/      # AI providers

Both recoder-web and recoder-code CLI use this core
```

---

## 🎯 Phase 6: Security & Scaling (Priority: HIGH)

### From CURRENT_STATUS.md

| Task | Implementation |
|------|----------------|
| API key encryption | Verify AES-256-GCM in all components |
| .env protection | Don't mount .env in Docker containers |
| Container isolation | Each user gets isolated container |
| Container pool scaling | Increase from 3 to 20+ warm containers |
| Rate limiting | Already exists, verify limits |
| Input sanitization | Audit all user inputs |

### Container Scaling Plan

```typescript
// docker-backend/src/container-pool.ts
const POOL_CONFIG = {
  minContainers: 10,      // Was 3
  maxContainers: 50,      // New limit
  warmupCount: 20,        // Pre-warm 20 containers
  recycleAfterUses: 10,   // Recycle after 10 uses
  maxIdleTime: 300000,    // 5 minutes idle timeout
};
```

---

## 🎯 Phase 7: Email & Auth (Priority: MEDIUM)

### Tasks from CURRENT_STATUS.md

| Task | Status | Notes |
|------|--------|-------|
| Email login verification | Test | Manual test needed |
| Verify codes | Test | Check code validation |
| Onboarding emails | TODO | Welcome, getting started |
| Marketing emails | TODO | Newsletter, tips |

### Implementation

```
1. Test existing email flow manually
2. Add Resend/SendGrid for transactional emails
3. Create email templates:
   - Welcome email
   - Verify email
   - Password reset
   - Weekly tips
   - Feature announcements
```

---

## 📋 Task Checklist

### Week 1: Foundation
- [ ] Create `recoder-web/app/lib/modes/` directory
- [ ] Copy mode types from Kilo
- [ ] Implement mode selector UI
- [ ] Update system prompt for modes
- [ ] Test mode switching

### Week 2: Tools
- [ ] Implement `edit_file` with str_replace
- [ ] Improve `read_file` to show line numbers
- [ ] Add `search_files` with ripgrep
- [ ] Add `update_todo_list` tool
- [ ] Test agentic workflow

### Week 3: Debug Mode
- [ ] Implement auto-error detection
- [ ] Force exploration before fixing
- [ ] Add diagnosis confirmation step
- [ ] Test with real errors

### Week 4: Autocomplete
- [ ] Create autocomplete service
- [ ] Integrate with Monaco editor
- [ ] Add debouncing
- [ ] Test ghost text display

### Week 5: Security & Scaling
- [ ] Audit API key handling
- [ ] Increase container pool
- [ ] Add container isolation
- [ ] Load test with multiple users

### Week 6: Polish
- [ ] Test email flows
- [ ] Add onboarding emails
- [ ] User profile pictures in chat
- [ ] Documentation

---

## 🔗 Key Kilo Code Files Reference

```
kilocode/
├── packages/types/src/
│   ├── mode.ts              # Mode definitions (COPY)
│   └── tool.ts              # Tool types (COPY)
├── src/
│   ├── core/
│   │   ├── prompts/         # System prompts (STUDY)
│   │   └── tools/           # Tool implementations (COPY)
│   ├── services/
│   │   ├── ghost/           # Autocomplete (COPY)
│   │   └── ripgrep/         # Search (COPY)
│   └── shared/
│       ├── modes.ts         # Mode helpers (COPY)
│       └── tools.ts         # Tool registry (COPY)
└── cli/src/
    ├── commands/            # CLI commands (REFERENCE)
    └── ui/                  # Terminal UI (REFERENCE)
```

---

## ✅ Success Criteria

1. **Mode System**: User can switch between Architect/Code/Ask/Debug modes
2. **Agentic Tools**: AI explores codebase before making changes
3. **Debug Mode**: AI diagnoses errors before fixing
4. **Autocomplete**: Ghost text appears while typing
5. **Scaling**: 50+ concurrent users supported
6. **Security**: API keys encrypted, containers isolated

---

## 🆕 Complete Kilo Code Directory Mapping

### CLI Features
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/cli/src/commands/` | CLI command system (mode, model, session, checkpoint, tasks) | HIGH | `recoder-code/packages/cli/src/commands/` |
| `kilocode/cli/src/communication/` | Inter-process communication | MEDIUM | `recoder-code/packages/core/src/communication/` |
| `kilocode/cli/src/parallel/` | Git worktree parallel execution | HIGH | `recoder-code/packages/core/src/parallel/` |

### Cloud Package
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/packages/cloud/` | Complete cloud integration package | HIGH | `recoder-web/app/lib/services/cloud/` |
| `kilocode/packages/cloud/src/CloudService.ts` | Cloud integration singleton | HIGH | `recoder-web/app/lib/services/cloud/CloudService.ts` |
| `kilocode/packages/cloud/src/CloudAPI.ts` | API client | HIGH | `recoder-web/app/lib/services/cloud/CloudAPI.ts` |
| `kilocode/packages/cloud/src/CloudSettingsService.ts` | Settings sync | MEDIUM | `recoder-web/app/lib/services/cloud/settings.ts` |
| `kilocode/packages/cloud/src/CloudShareService.ts` | Task sharing | LOW | `recoder-web/app/lib/services/cloud/sharing.ts` |
| `kilocode/packages/cloud/src/TelemetryClient.ts` | Usage tracking | MEDIUM | `recoder-web/app/lib/services/cloud/telemetry.ts` |
| `kilocode/packages/cloud/src/bridge/` | Extension-cloud communication | MEDIUM | `recoder-web/app/lib/services/cloud/bridge/` |

### VSCode Extension Activation
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/activate/` | Complete activation system | MEDIUM | `recoder-web/app/lib/activation/` |
| `kilocode/src/activate/registerCommands.ts` | Command registration | MEDIUM | `recoder-web/app/lib/activation/commands.ts` |
| `kilocode/src/activate/CodeActionProvider.ts` | Quick fixes | MEDIUM | `recoder-web/app/lib/activation/actions.ts` |
| `kilocode/src/activate/handleTask.ts` | Task handling | HIGH | `recoder-web/app/lib/activation/tasks.ts` |

### API Providers
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/api/` | Complete API provider system | HIGH | `recoder-code/packages/core/src/api/` |
| `kilocode/src/api/providers/base-provider.ts` | Base provider pattern | HIGH | `recoder-code/packages/core/src/api/base-provider.ts` |
| `kilocode/src/api/providers/bedrock.ts` | AWS Bedrock | HIGH | `recoder-code/packages/core/src/api/bedrock.ts` |
| `kilocode/src/api/providers/anthropic-vertex.ts` | Google Vertex | MEDIUM | `recoder-code/packages/core/src/api/vertex.ts` |
| `kilocode/src/api/providers/native-ollama.ts` | Local Ollama | HIGH | `recoder-code/packages/core/src/api/ollama.ts` |

### Core System
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/core/` | Complete core system | HIGH | `recoder-code/packages/core/src/` |
| `kilocode/src/core/tools/` | All tool implementations | HIGH | `recoder-web/app/lib/.server/llm/tools/` |
| `kilocode/src/core/prompts/` | System prompts | HIGH | `recoder-web/app/lib/.server/llm/prompts/` |
| `kilocode/src/core/task/` | Task management | HIGH | `recoder-code/packages/core/src/task/` |
| `kilocode/src/core/checkpoints/` | Checkpoint system | MEDIUM | `recoder-code/packages/core/src/checkpoints/` |
| `kilocode/src/core/diff/` | Diff utilities | HIGH | `recoder-code/packages/core/src/diff/` |
| `kilocode/src/core/context/` | Context management | MEDIUM | `recoder-code/packages/core/src/context/` |
| `kilocode/src/core/mentions/` | @mentions system | LOW | `recoder-web/app/lib/mentions/` |

### Services
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/services/` | Complete services package | HIGH | `recoder-code/packages/core/src/services/` |
| `kilocode/src/services/ghost/` | Inline autocomplete | HIGH | `recoder-web/app/components/editor/ghost/` |
| `kilocode/src/services/tree-sitter/` | Code parsing | HIGH | `recoder-code/packages/core/src/services/parser/` |
| `kilocode/src/services/code-index/` | Codebase indexing | HIGH | `recoder-code/packages/core/src/services/index/` |
| `kilocode/src/services/mcp/` | MCP hub | MEDIUM | `recoder-code/packages/core/src/services/mcp/` |
| `kilocode/src/services/checkpoints/` | Shadow checkpoints | MEDIUM | `recoder-code/packages/core/src/services/checkpoints/` |
| `kilocode/src/services/ripgrep/` | Fast search | HIGH | `recoder-code/packages/core/src/services/search/` |
| `kilocode/src/services/browser/` | Browser automation | MEDIUM | `recoder-code/packages/core/src/services/browser/` |
| `kilocode/src/services/commit-message/` | AI commit messages | MEDIUM | `recoder-code/packages/core/src/services/git/` |
| `kilocode/src/services/marketplace/` | Extension marketplace | LOW | `recoder-web/app/lib/services/marketplace/` |

### Integrations
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/integrations/` | External integrations | LOW | `recoder-code/packages/core/src/integrations/` |

### Shared Utilities
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/shared/` | Shared utilities | HIGH | `recoder-code/packages/core/src/shared/` |
| `kilocode/src/shared/modes.ts` | Mode helpers | HIGH | `recoder-web/app/lib/modes/helpers.ts` |
| `kilocode/src/shared/tools.ts` | Tool registry | HIGH | `recoder-web/app/lib/.server/llm/tools/registry.ts` |
| `kilocode/src/shared/experiments.ts` | Feature flags | LOW | `recoder-web/app/lib/experiments.ts` |

### Workers
| Source | Purpose | Priority | Copy To |
|--------|---------|----------|---------|
| `kilocode/src/workers/` | Background workers | MEDIUM | `recoder-code/packages/core/src/workers/` |
| `kilocode/src/workers/countTokens.ts` | Token counting | MEDIUM | `recoder-code/packages/core/src/workers/tokens.ts` |

---

## 📁 Detailed File Reference

See **KILO_CODE_FEATURES.md** for complete file mapping and implementation order.


we copy more stuff from kilo code to recoder web and recoder code like paralel executions'/Users/arhansubasi/recoder.xyz/kilocode/cli/src/commands''/Users/arhansubasi/recoder.xyz/kilocode/cli/src/communication''/Users/arhansubasi/recoder.xyz/kilocode/cli/src/parallel''/Users/arhansubasi/recoder.xyz/kilocode/packages/cloud''/Users/arhansubasi/recoder.xyz/kilocode/src/activate''/Users/arhansubasi/recoder.xyz/kilocode/src/api''/Users/arhansubasi/recoder.xyz/kilocode/src/core''/Users/arhansubasi/recoder.xyz/kilocode/src/integrations''/Users/arhansubasi/recoder.xyz/kilocode/src/services''/Users/arhansubasi/recoder.xyz/kilocode/src/shared''/Users/arhansubasi/recoder.xyz/kilocode/src/workers' add
 all of these to docs we should work on these 