# Kilo Code Integration Plan

## Phase 1: Core Tools (Week 1)

### 1. str_replace Tool Implementation
**Priority: CRITICAL**
- Copy `SearchReplaceTool.ts` from Kilo
- Integrate into recoder-web AI system
- Replace current full-file regeneration

### 2. Enhanced File Tools
- Copy `ReadFileTool.ts` with line range support
- Copy `ExecuteCommandTool.ts` improvements
- Add proper error handling

## Phase 2: Parallel Execution (Week 2)

### 1. Git Worktree System
- Copy `parallel.ts` and `determineBranch.ts`
- Integrate with recoder-code CLI
- Add auto-commit functionality

### 2. CLI Commands
- Copy command registry system
- Implement mode switching
- Add session management

## Phase 3: Multi-Mode System (Week 3)

### 1. Mode Definitions
- Copy mode types from Kilo
- Implement Architect/Code/Debug/Ask modes
- Add mode-specific prompts

### 2. UI Integration
- Create mode selector component
- Update system prompts per mode
- Restrict tools based on mode

## Phase 4: Ghost Autocomplete (Week 4)

### 1. Service Implementation
- Adapt GhostServiceManager for Monaco
- Implement inline completion provider
- Add cost tracking

### 2. Editor Integration
- Monaco editor integration
- Ghost text display
- Tab completion handling

## Phase 5: Cloud & Services (Week 5)

### 1. Cloud Integration
- Copy CloudService and CloudAPI
- Implement settings sync
- Add telemetry tracking

### 2. Advanced Services
- Code indexing service
- Checkpoint system
- MCP marketplace

## File Mapping

| Kilo Source | Recoder Target | Status |
|-------------|----------------|--------|
| `src/core/tools/SearchReplaceTool.ts` | `recoder-web/app/lib/.server/llm/tools/str-replace.ts` | TODO |
| `cli/src/parallel/` | `recoder-code/packages/core/src/parallel/` | TODO |
| `packages/types/src/mode.ts` | `recoder-web/app/lib/modes/types.ts` | TODO |
| `src/services/ghost/` | `recoder-web/app/components/editor/ghost/` | TODO |
| `packages/cloud/` | `recoder-web/app/lib/services/cloud/` | TODO |

## Success Metrics

- [ ] AI uses str_replace instead of full file regeneration
- [ ] Parallel execution works in CLI
- [ ] Mode switching functional
- [ ] Ghost text appears while typing
- [ ] Cloud sync operational
