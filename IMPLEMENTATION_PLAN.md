# Implementation Plan: Real Settings & CLI Features

## 🎯 Overview

Building **real functionality** for:
1. **Recoder-web Settings** - Full settings system with database + APIs
2. **CLI Commands** - Actual features (agents, files, sandbox)

---

## 📋 Part 1: Recoder-Web Settings System

### Database Schema

```sql
-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Editor preferences
  theme VARCHAR(20) DEFAULT 'dark', -- 'dark', 'light', 'auto'
  font_size INTEGER DEFAULT 14,
  font_family VARCHAR(100) DEFAULT 'JetBrains Mono',
  tab_size INTEGER DEFAULT 2,
  word_wrap BOOLEAN DEFAULT true,
  line_numbers BOOLEAN DEFAULT true,
  minimap BOOLEAN DEFAULT true,

  -- AI preferences
  default_model VARCHAR(100) DEFAULT 'claude-3.5-sonnet',
  ai_temperature DECIMAL(2,1) DEFAULT 0.7,
  ai_max_tokens INTEGER DEFAULT 4096,
  streaming_enabled BOOLEAN DEFAULT true,

  -- Terminal preferences
  terminal_shell VARCHAR(50) DEFAULT 'bash',
  terminal_font_size INTEGER DEFAULT 14,
  terminal_cursor_style VARCHAR(20) DEFAULT 'block',

  -- Project preferences
  auto_save BOOLEAN DEFAULT true,
  auto_save_delay INTEGER DEFAULT 1000, -- ms
  format_on_save BOOLEAN DEFAULT true,

  -- Keyboard shortcuts (JSONB for flexibility)
  keyboard_shortcuts JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_settings_timestamp
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_user_settings_timestamp();
```

### API Routes

**File:** `/recoder-web/app/routes/api.settings.ts`

```typescript
// GET /api/settings - Load user settings
// POST /api/settings - Save user settings
// PATCH /api/settings - Update partial settings
// DELETE /api/settings - Reset to defaults
```

### Settings UI Components

**Pages to create:**
1. `/recoder-web/app/routes/settings.tsx` - Settings layout
2. `/recoder-web/app/routes/settings.editor.tsx` - Editor settings
3. `/recoder-web/app/routes/settings.ai.tsx` - AI preferences
4. `/recoder-web/app/routes/settings.terminal.tsx` - Terminal settings
5. `/recoder-web/app/routes/settings.shortcuts.tsx` - Keyboard shortcuts
6. `/recoder-web/app/routes/settings.project.tsx` - Project preferences

### Settings Store Enhancement

**File:** `/recoder-web/app/lib/stores/settings.ts`

Expand to include:
- Theme settings
- Editor preferences
- AI model preferences
- Auto-save settings
- Load from database
- Save to database

---

## 📋 Part 2: CLI Commands as Features

### 1. Agent Create (`recoder agent create @expert`)

**What it does:**
- Creates specialized AI agents with specific system prompts
- Saves agent configurations
- Allows switching between agents mid-conversation

**Implementation:**

```typescript
// packages/recoder-code/packages/cli/src/commands/agent/create.ts

interface AgentConfig {
  name: string;
  type: 'expert' | 'reviewer' | 'debugger' | 'architect' | 'custom';
  systemPrompt: string;
  model: string;
  temperature: number;
}

// Built-in agent types:
const AGENT_TYPES = {
  expert: {
    systemPrompt: 'You are an expert software engineer with deep knowledge...',
    model: 'claude-3.5-sonnet',
    temperature: 0.3
  },
  reviewer: {
    systemPrompt: 'You are a code reviewer focusing on best practices...',
    model: 'gpt-4-turbo',
    temperature: 0.2
  },
  debugger: {
    systemPrompt: 'You are a debugging specialist...',
    model: 'claude-3.5-sonnet',
    temperature: 0.1
  },
  // ... more
};

// Save to: ~/.recoder/agents/{agent-name}.json
```

**Commands:**
```bash
recoder agent create @expert          # Create expert agent
recoder agent create @reviewer        # Create code reviewer
recoder agent create @debugger        # Create debugger
recoder agent create @custom --name "React Expert" --prompt "..."
recoder agent list                    # List all agents
recoder agent use @expert             # Switch to agent
recoder agent delete @expert          # Delete agent
```

---

### 2. File Operations (`recoder file create app.ts`)

**What it does:**
- AI-powered file creation with templates
- Intelligent file search
- Bulk file operations

**Implementation:**

```typescript
// packages/recoder-code/packages/cli/src/commands/file/index.ts

// File creation with AI
async function createFile(filename: string, options: {
  template?: string;
  prompt?: string;
  language?: string;
}) {
  // If template provided, use it
  if (options.template) {
    return useTemplate(filename, options.template);
  }

  // If prompt provided, generate with AI
  if (options.prompt) {
    return generateWithAI(filename, options.prompt);
  }

  // Otherwise, create empty file with basic structure
  return createEmptyFile(filename, options.language);
}

// AI-powered search
async function searchFiles(query: string) {
  // Use vector embeddings to find relevant files
  // Or use fuzzy matching with file content
}
```

**Commands:**
```bash
recoder file create app.ts                          # Create empty TypeScript file
recoder file create api.ts --template "express-api" # Use template
recoder file create utils.ts --prompt "Create utility functions for date formatting"
recoder file search "authentication logic"          # AI-powered search
recoder file rename old.ts new.ts                   # Smart rename (updates imports)
recoder file delete temp*.ts                        # Bulk delete with pattern
```

---

### 3. Sandbox Mode (`recoder sandbox enable`)

**What it does:**
- Isolates code execution in Docker containers
- Safe testing environment
- Network isolation options

**Implementation:**

```typescript
// packages/recoder-code/packages/cli/src/commands/sandbox/index.ts

interface SandboxConfig {
  enabled: boolean;
  dockerImage: string;
  network: 'isolated' | 'restricted' | 'full';
  volumes: string[];
  env: Record<string, string>;
}

async function enableSandbox(options: Partial<SandboxConfig>) {
  // 1. Check Docker installation
  const dockerInstalled = await checkDocker();
  if (!dockerInstalled) {
    throw new Error('Docker is required for sandbox mode');
  }

  // 2. Pull sandbox image
  await pullImage(options.dockerImage || 'recoder-sandbox:latest');

  // 3. Create container
  const containerId = await createContainer(options);

  // 4. Save sandbox config
  await saveSandboxConfig({
    enabled: true,
    containerId,
    ...options
  });
}

// Execute code in sandbox
async function executeInSandbox(code: string, language: string) {
  const config = await loadSandboxConfig();

  if (!config.enabled) {
    // Run normally
    return executeLocal(code, language);
  }

  // Run in Docker container
  return executeDocker(code, language, config.containerId);
}
```

**Commands:**
```bash
recoder sandbox enable                    # Enable with defaults
recoder sandbox enable --network isolated # Fully isolated
recoder sandbox disable                   # Disable sandbox
recoder sandbox status                    # Check if enabled
recoder sandbox exec "npm test"           # Run command in sandbox
recoder sandbox logs                      # View sandbox logs
recoder sandbox clean                     # Remove sandbox container
```

---

## 📊 Implementation Priority

### Phase 1: Settings System (2-3 hours)
1. ✅ Create database schema
2. ✅ Run migrations on Neon
3. ✅ Create API routes
4. ✅ Build settings UI components
5. ✅ Connect to database
6. ✅ Test complete flow

### Phase 2: Agent System (1-2 hours)
1. ✅ Create agent configuration system
2. ✅ Build built-in agent templates
3. ✅ Implement agent creation command
4. ✅ Add agent switching
5. ✅ Test with different agent types

### Phase 3: File Operations (1-2 hours)
1. ✅ Implement file creation with templates
2. ✅ Add AI-powered generation
3. ✅ Build file search
4. ✅ Add smart rename (update imports)
5. ✅ Test file operations

### Phase 4: Sandbox Mode (2-3 hours)
1. ✅ Create Docker sandbox image
2. ✅ Implement sandbox enable/disable
3. ✅ Add code execution in sandbox
4. ✅ Implement network isolation
5. ✅ Test sandbox execution

---

## 🎯 Which to Build First?

**Your choice - all are valuable:**

### Option A: Settings First (Recommended)
**Why:** Foundational, affects UX immediately
**Impact:** Better user experience in Web IDE
**Time:** 2-3 hours

### Option B: Agent System First
**Why:** Unique differentiator, powerful feature
**Impact:** Advanced AI capabilities
**Time:** 1-2 hours

### Option C: All Together
**Why:** Complete feature set
**Impact:** Maximum value
**Time:** 6-10 hours total

---

## 🚀 Quick Start

Tell me which you want to build first, and I'll start implementing:

1. **Settings system** (database + API + UI)
2. **Agent creation** (AI agent management)
3. **File operations** (AI-powered file tools)
4. **Sandbox mode** (Docker isolation)
5. **All of them** (full implementation)

What's your preference?
