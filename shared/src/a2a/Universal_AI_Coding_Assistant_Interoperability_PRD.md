# Universal AI Coding Assistant Interoperability
## Technical PRD: Connecting Claude Code, Codex, Cursor, VS Code, Windsurf, Replit & More

**Version:** 2.1  
**Date:** February 15, 2026  
**Status:** Draft reference PRD (canonical architecture moved)

**Canonical architecture:** `shared/src/a2a/UNIFIED_A2A_UACB_ARCHITECTURE.md`  
**Execution lock:** Tier-1 connectors only (`codex`, `claude`) until no-skip Phase 3 closeout is complete.

---

## 1. Executive Summary

### 1.1 The Problem

Developers today face a fragmented AI coding landscape:

| Platform | Type | Integration Capability | Protocol |
|----------|------|------------------------|----------|
| **Claude Code** | CLI tool | ✅ MCP Server Mode | MCP/stdio |
| **Codex** | CLI tool | ✅ JSON-RPC over stdio | Custom JSON-RPC |
| **Cursor** | VS Code fork | ❌ Proprietary/Closed | Internal only |
| **VS Code + Copilot** | IDE + Extension | ✅ Language Server Protocol | LSP |
| **Windsurf** | Standalone IDE | ⚠️ Limited (Plugin API) | Partial |
| **Replit** | Cloud IDE | ⚠️ API via Replit AI | Custom REST |
| **recoder.xyz** | CLI + Web IDE | ✅ CLI + Web API | Custom + REST |
| **JetBrains + AI** | IDE + Plugin | ⚠️ Plugin API | Partial |

**The Challenge:** Each platform operates in isolation. Developers cannot:
- Start coding in Cursor and seamlessly continue in Claude Code
- Have Codex and Claude collaborate on the same task
- Maintain context when switching between cloud (Replit) and local (VS Code) environments
- Use the best AI for each task regardless of the IDE they're using

### 1.2 The Vision

Create a **Universal AI Coding Bridge (UACB)** — a middleware layer that enables:

1. **Cross-Platform Context Sync**: Your coding context follows you across IDEs
2. **Agent Interoperability**: Multiple AI assistants collaborating on the same codebase
3. **Best-Tool-for-Job**: Use Claude for architecture, Codex for implementation, Cursor for refactoring
4. **Unified Memory**: Shared conversation history, code understanding, and project context

This PRD remains the detailed reference for connector and adapter patterns. Runtime semantics, policy decisions, and release support status are governed by the unified architecture document and blueprint release gates.

---

## 2. Platform Analysis

### 2.1 Integration Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    PLATFORM INTEGRATION CAPABILITIES                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Platform        │  Protocol    │  Access Level  │  Context Export  │  Automation   │
│  ────────────────┼──────────────┼────────────────┼──────────────────┼───────────────│
│  Claude Code     │  MCP/stdio   │  Full          │  ✅ Yes          │  ✅ Full      │
│  Codex CLI       │  JSON-RPC    │  Full          │  ✅ Yes          │  ✅ Full      │
│  VS Code+Copilot │  LSP         │  Full          │  ✅ Yes          │  ✅ Full      │
│  Cursor          │  None        │  None          │  ⚠️ File-based   │  ❌ No        │
│  Windsurf        │  Plugin API  │  Limited       │  ⚠️ File-based   │  ⚠️ Partial   │
│  Replit          │  REST API    │  Limited       │  ✅ API          │  ⚠️ Partial   │
│  recoder.xyz     │  CLI+REST    │  Full          │  ✅ Yes          │  ✅ Full      │
│  JetBrains AI    │  Plugin API  │  Limited       │  ⚠️ File-based   │  ⚠️ Partial   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Platform Deep Dive

#### 2.2.1 Claude Code (Anthropic)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐      MCP/stdio       ┌─────────────────┐   │
│  │  External   │◄────────────────────►│   Claude Code   │   │
│  │   Client    │   JSON-RPC 2.0       │   (MCP Server)  │   │
│  └─────────────┘                      └────────┬────────┘   │
│                                                 │            │
│                                                 ▼            │
│                                        ┌─────────────────┐   │
│                                        │  Tool Registry  │   │
│                                        │  - File ops     │   │
│                                        │  - Bash exec    │   │
│                                        │  - Code search  │   │
│                                        └─────────────────┘   │
│                                                              │
│  Capabilities:                                               │
│  • Full codebase access via tools                            │
│  • Bash command execution                                    │
│  • File read/write/search                                    │
│  • Linter integration                                        │
│  • Git operations                                            │
│                                                              │
│  Start as MCP server: claude mcp serve                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **MCP Server Mode**: `claude mcp serve` exposes all capabilities via MCP
- **Tools Available**: `Read`, `Write`, `Edit`, `Bash`, `Search`, `Linter`
- **Context**: Full project context via tool access
- **Best For**: Architecture decisions, complex refactoring, security reviews

#### 2.2.2 Codex CLI (OpenAI)

```
┌─────────────────────────────────────────────────────────────┐
│                     CODEX CLI ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐      JSON-RPC/stdio    ┌─────────────────┐ │
│  │   Client    │◄──────────────────────►│   Codex Core    │ │
│  │  (any app)  │   LSP-like protocol    │     (Rust)      │ │
│  └─────────────┘                        └────────┬────────┘ │
│                                                   │          │
│  Methods:                                         ▼          │
│  • tasks/send       - Submit task                ┌─────────┐ │
│  • tasks/get        - Get status                │  Agent  │ │
│  • tasks/cancel     - Cancel task               │  Core   │ │
│  • approvals/respond - Approve action           └─────────┘ │
│                                                              │
│  Features:                                                   │
│  • Full-screen UI (optional: --jsonrpc)                      │
│  • Approval workflows for file/network operations            │
│  • Network sandboxing                                        │
│  • Streaming responses                                       │
│                                                              │
│  Start JSON-RPC mode: codex --jsonrpc                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **JSON-RPC over stdio**: Full programmatic control
- **Task Lifecycle**: Submitted → Working → Input-Required → Completed
- **Approval System**: Built-in human-in-the-loop for sensitive operations
- **Best For**: Implementation tasks, code generation, testing

#### 2.2.3 VS Code + GitHub Copilot

```
┌─────────────────────────────────────────────────────────────┐
│              VS CODE + COPILOT ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              GitHub Copilot Language Server            │  │
│  │                  (@github/copilot-language-server)     │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │                                                        │  │
│  │  Protocol: LSP (Language Server Protocol)              │  │
│  │  Transport: stdio over Node.js                         │  │
│  │                                                        │  │
│  │  Key Methods:                                          │  │
│  │  • getCompletions      - Inline suggestions            │  │
│  │  • getCompletionsCycling - Multiple alternatives       │  │
│  │  • conversation/create - Chat sessions                 │  │
│  │  • conversation/turn   - Chat messages                 │  │
│  │  • signInInitiate      - Authentication                │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  VS Code Extension APIs:                                     │
│  • Language Model API - Direct LLM access                    │
│  • Chat API - Custom chat participants                       │
│  • MCP Server Registration - Programmatic MCP                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **Copilot Language Server**: Can be spawned independently via npm
- **VS Code LM API**: Access Copilot's models programmatically
- **MCP Support**: Can register MCP servers from extensions
- **Best For**: Inline completions, chat-based assistance, IDE-native experience

#### 2.2.4 Cursor (Anysphere)

```
┌─────────────────────────────────────────────────────────────┐
│                    CURSOR ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Cursor IDE (VS Code Fork)               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │                                                      │    │
│  │  Architecture: Standalone, proprietary              │    │
│  │  AI Integration: Deep, native                       │    │
│  │                                                      │    │
│  │  Key Features:                                       │    │
│  │  • Composer - Multi-file editing                    │    │
│  │  • Agent Mode - Autonomous task execution           │    │
│  │  • @ mentions - Context attachment                  │    │
│  │  • Codebase indexing - Vector search                │    │
│  │                                                      │    │
│  │  ⚠️ NO PUBLIC API                                    │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Integration Strategy:                                       │
│  • File system as the universal interface                    │
│  • Git for synchronization                                   │
│  • Cursor Rules (.cursorrules) for agent behavior            │
│  • Shared context via project files                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **No Public API**: Cursor is completely closed
- **File System Bridge**: Only integration via shared files
- **Cursor Rules**: Can configure behavior via `.cursorrules` files
- **Best For**: Complex multi-file edits, agentic workflows (when used standalone)

#### 2.2.5 Windsurf (Codeium)

```
┌─────────────────────────────────────────────────────────────┐
│                   WINDSURF ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Windsurf IDE (Standalone)               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │                                                      │    │
│  │  Architecture: Standalone AI-native editor          │    │
│  │  Cascade: Agentic AI feature                        │    │
│  │                                                      │    │
│  │  Key Features:                                       │    │
│  │  • Cascade - Multi-file agentic editing             │    │
│  │  • Codeium autocomplete - Inline suggestions        │    │
│  │  • Full codebase understanding                      │    │
│  │                                                      │    │
│  │  Plugin API: Limited                                │    │
│  │  VS Code Extension: Available (limited)             │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Integration Strategy:                                       │
│  • VS Code extension for partial integration                 │
│  • File system for full integration                          │
│  • Cascade can be triggered via file changes                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **VS Code Extension**: Limited functionality
- **File System**: Full integration possible
- **Cascade**: Agentic features via UI only
- **Best For**: Agentic workflows, multi-file refactoring

#### 2.2.6 Replit (Ghostwriter)

```
┌─────────────────────────────────────────────────────────────┐
│                    REPLIT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Replit Cloud IDE                        │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │                                                      │    │
│  │  Ghostwriter: AI coding assistant                   │    │
│  │  Replit Agent: Full project generation              │    │
│  │                                                      │    │
│  │  AI Integrations API:                                │    │
│  │  • Managed access to 300+ models                    │    │
│  │  • OpenAI, Anthropic, Google, OpenRouter            │    │
│  │  • Zero setup required                              │    │
│  │  • Transparent billing                              │    │
│  │                                                      │    │
│  │  ⚠️ Cloud-only, no local execution                   │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Integration Strategy:                                       │
│  • Replit AI Integrations API (REST)                         │
│  • Git import/export for code sync                           │
│  • Replit Agent for project scaffolding                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **AI Integrations API**: REST API for model access
- **Git Sync**: Import/export projects
- **Agent**: Natural language project creation
- **Best For**: Rapid prototyping, learning, cloud-based development

#### 2.2.7 recoder.xyz

```
┌─────────────────────────────────────────────────────────────┐
│                   RECODER.XYZ ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐         ┌─────────────────────────┐    │
│  │   recoder CLI   │◄───────►│    recoder Web IDE      │    │
│  │                 │  Sync   │                         │    │
│  │  • Interactive  │         │  • Browser-based        │    │
│  │    chat UI      │         │  • 40+ models           │    │
│  │  • 40+ commands │         │  • Two-way sync         │    │
│  │  • Sandbox mode │         │  • Project hosting      │    │
│  │  • File ops     │         │                         │    │
│  └─────────────────┘         └─────────────────────────┘    │
│                                                              │
│  Key Commands:                                               │
│  • recoder-code          - Launch interactive chat           │
│  • recoder agent create  - Create specialized agents         │
│  • recoder file create   - AI-powered file operations        │
│  • recoder web sync      - Sync CLI ↔ Web                    │
│  • recoder web download  - Download web project              │
│                                                              │
│  Integration Strategy:                                       │
│  • CLI has full programmatic access                          │
│  • Web API for cloud operations                              │
│  • File system sync for local integration                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Integration Points:**
- **CLI**: Full programmatic access
- **Web API**: REST endpoints
- **Sync**: Two-way CLI ↔ Web synchronization
- **Best For**: CLI-first workflows, web-to-local transitions

---

## 3. Universal AI Coding Bridge (UACB) Architecture

### 3.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         UNIVERSAL AI CODING BRIDGE (UACB)                            │
│                    "The Middleware for AI Coding Assistant Interoperability"         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         UNIFIED API LAYER                                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │    │
│  │  │   Tasks     │  │   Chat      │  │   Context   │  │   Collaboration     │ │    │
│  │  │   API       │  │   API       │  │   API       │  │   API               │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                              │
│  ┌────────────────────────────────────┼────────────────────────────────────────────┐│
│  │                         PROTOCOL ADAPTERS                                       ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ││
│  │  │  MCP     │ │ JSON-RPC │ │   LSP    │ │  REST    │ │  File    │ │  Git     │ ││
│  │  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │ ││
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ ││
│  └───────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────┘│
│          │            │            │            │            │            │         │
│  ┌───────▼────────────▼────────────▼────────────▼────────────▼────────────▼────────┐│
│  │                         PLATFORM CONNECTORS                                      ││
│  │                                                                                  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ ││
│  │  │ Claude Code  │  │    Codex     │  │ VS Code+     │  │     Cursor           │ ││
│  │  │ Connector    │  │  Connector   │  │ Copilot      │  │  Connector           │ ││
│  │  │ (MCP)        │  │  (JSON-RPC)  │  │ Connector    │  │  (File/Git)          │ ││
│  │  └──────────────┘  └──────────────┘  │ (LSP)        │  └──────────────────────┘ ││
│  │                                       └──────────────┘                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ ││
│  │  │   Windsurf   │  │    Replit    │  │  recoder.xyz │  │   Future Platforms   │ ││
│  │  │  Connector   │  │  Connector   │  │  Connector   │  │   (Plugin API)       │ ││
│  │  │ (File/Git)   │  │  (REST API)  │  │  (CLI+REST)  │  │                      │ ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────┘ ││
│  │                                                                                  ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐│
│  │                         SHARED INFRASTRUCTURE                                    ││
│  │                                                                                  ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ ││
│  │  │   Context   │  │    Chat     │  │   Vector    │  │      Session            │ ││
│  │  │   Store     │  │   History   │  │   Search    │  │      Manager            │ ││
│  │  │  (SQLite)   │  │  (PostgreSQL)│  │  (Pinecone) │  │     (Redis)             │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────────┘ ││
│  │                                                                                  ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Core Components

#### 3.2.1 Protocol Adapters

| Adapter | Purpose | Protocols Handled |
|---------|---------|-------------------|
| **MCP Adapter** | Claude Code, MCP-compatible tools | MCP over stdio/SSE |
| **JSON-RPC Adapter** | Codex CLI, custom tools | JSON-RPC 2.0 over stdio |
| **LSP Adapter** | VS Code, Copilot, language tools | Language Server Protocol |
| **REST Adapter** | Replit, recoder.xyz, cloud services | HTTP/REST APIs |
| **File Adapter** | Cursor, Windsurf, file-based tools | File system watching |
| **Git Adapter** | All platforms | Git operations, sync |

#### 3.2.2 Platform Connectors

Each connector implements:
- **Capability Discovery**: What can this platform do?
- **Context Extraction**: Get current project state
- **Task Submission**: Send work to the platform
- **Result Retrieval**: Get output/completion
- **Event Streaming**: Real-time updates

### 3.3 Unified Data Models

#### 3.3.1 Task Model

```typescript
interface Task {
  id: string;
  type: 'generate' | 'refactor' | 'review' | 'explain' | 'test' | 'debug';
  description: string;
  context: {
    codebase: CodebaseContext;
    conversation: Message[];
    files: FileContext[];
  };
  constraints: {
    platform?: string;      // Preferred platform
    model?: string;         // Specific model
    autoApprove: boolean;   // Skip approvals
    timeout: number;        // Max execution time
  };
  status: TaskStatus;
  result?: TaskResult;
}

interface TaskStatus {
  state: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  platform: string;
  startTime: Date;
  endTime?: Date;
  progress?: number;
  message?: string;
}

interface TaskResult {
  output: string;
  files: FileChange[];
  artifacts: Artifact[];
  metrics: ExecutionMetrics;
}
```

#### 3.3.2 Context Model

```typescript
interface CodebaseContext {
  rootPath: string;
  language: string;
  framework?: string;
  dependencies: Dependency[];
  structure: DirectoryTree;
  recentChanges: GitChange[];
  indexedAt: Date;
}

interface FileContext {
  path: string;
  content: string;
  language: string;
  cursor?: Position;
  selection?: Range;
  isActive: boolean;
  lastModified: Date;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  platform: string;
  timestamp: Date;
  attachments?: Attachment[];
}
```

#### 3.3.3 Platform Capability Model

```typescript
interface PlatformCapabilities {
  platform: string;
  version: string;
  
  // Core capabilities
  canGenerate: boolean;
  canRefactor: boolean;
  canReview: boolean;
  canExplain: boolean;
  canTest: boolean;
  canDebug: boolean;
  
  // Execution modes
  supportsStreaming: boolean;
  supportsAgentMode: boolean;
  requiresApproval: boolean;
  
  // Context handling
  maxContextTokens: number;
  supportsMultiFile: boolean;
  supportsCodebaseIndexing: boolean;
  
  // Integration
  protocols: Protocol[];
  authentication: AuthMethod;
}
```

---

## 4. Implementation: Platform Connectors

### 4.1 Claude Code Connector

```python
# connectors/claude_code_connector.py
import subprocess
import json
import asyncio
from typing import AsyncIterator, Optional
from dataclasses import dataclass

@dataclass
class ClaudeConfig:
    working_dir: str
    allowed_tools: list[str] = None
    auto_approve: bool = False

class ClaudeCodeConnector:
    """
    Connector for Claude Code via MCP protocol.
    Spawns Claude as MCP server and communicates via stdio.
    """
    
    def __init__(self, config: ClaudeConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.message_id = 0
        self.pending_requests = {}
    
    async def start(self):
        """Start Claude Code in MCP server mode"""
        self.process = subprocess.Popen(
            ["claude", "mcp", "serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.config.working_dir,
            bufsize=1,
            universal_newlines=True
        )
        
        # Initialize MCP connection
        await self._initialize_mcp()
        
        # Start response reader
        asyncio.create_task(self._read_responses())
    
    async def _initialize_mcp(self):
        """Perform MCP handshake"""
        init_request = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "uacb-connector",
                    "version": "1.0.0"
                }
            },
            "id": self._next_id()
        }
        
        response = await self._send_request(init_request)
        self.server_capabilities = response.get("result", {}).get("capabilities", {})
        
        # Send initialized notification
        self._send_notification("initialized", {})
    
    async def execute_task(self, task: Task) -> AsyncIterator[TaskUpdate]:
        """Execute a task using Claude's tools"""
        
        # Build prompt from task
        prompt = self._build_prompt(task)
        
        # Call the main tool
        request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "default",
                "arguments": {
                    "prompt": prompt,
                    "context": task.context
                }
            },
            "id": self._next_id()
        }
        
        # Stream responses
        async for update in self._stream_request(request):
            yield TaskUpdate(
                state="running",
                content=update.get("content", ""),
                tool_calls=update.get("tool_calls", [])
            )
    
    async def get_context(self) -> CodebaseContext:
        """Extract current codebase context from Claude"""
        # Use Read and Search tools to understand codebase
        result = await self._call_tool("Search", {
            "query": "*",
            "path": self.config.working_dir
        })
        
        return CodebaseContext(
            rootPath=self.config.working_dir,
            language=self._detect_language(result),
            structure=self._parse_structure(result)
        )
    
    async def _call_tool(self, name: str, arguments: dict) -> dict:
        """Call a specific Claude tool"""
        request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
            "id": self._next_id()
        }
        
        return await self._send_request(request)
    
    def _build_prompt(self, task: Task) -> str:
        """Build prompt from task description and context"""
        parts = [f"Task: {task.description}"]
        
        if task.context.files:
            parts.append("\nRelevant files:")
            for f in task.context.files:
                parts.append(f"\n--- {f.path} ---\n{f.content}")
        
        if task.context.conversation:
            parts.append("\nConversation history:")
            for msg in task.context.conversation[-5:]:  # Last 5 messages
                parts.append(f"{msg.role}: {msg.content}")
        
        return "\n".join(parts)
    
    def _next_id(self) -> int:
        self.message_id += 1
        return self.message_id
    
    async def _send_request(self, request: dict) -> dict:
        """Send MCP request and wait for response"""
        future = asyncio.Future()
        self.pending_requests[request["id"]] = future
        
        self._send_message(request)
        
        return await future
    
    def _send_message(self, message: dict):
        """Send message to Claude stdin"""
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()
    
    def _send_notification(self, method: str, params: dict):
        """Send MCP notification (no response expected)"""
        self._send_message({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        })
    
    async def _read_responses(self):
        """Continuously read responses from Claude"""
        while self.process and self.process.poll() is None:
            line = self.process.stdout.readline()
            if line:
                try:
                    response = json.loads(line)
                    await self._handle_response(response)
                except json.JSONDecodeError:
                    pass
    
    async def _handle_response(self, response: dict):
        """Handle incoming MCP responses"""
        if "id" in response and response["id"] in self.pending_requests:
            future = self.pending_requests.pop(response["id"])
            if "result" in response:
                future.set_result(response)
            elif "error" in response:
                future.set_exception(Exception(response["error"]))
```

### 4.2 Codex Connector

```python
# connectors/codex_connector.py
import subprocess
import json
import asyncio
from typing import AsyncIterator, Optional, Callable
from dataclasses import dataclass

@dataclass
class CodexConfig:
    working_dir: str
    approval_handler: Optional[Callable] = None
    sandbox_mode: bool = True

class CodexConnector:
    """
    Connector for OpenAI Codex CLI via JSON-RPC.
    Spawns Codex as subprocess and manages task lifecycle.
    """
    
    def __init__(self, config: CodexConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.active_tasks = {}
        self.approval_handlers = {}
    
    async def start(self):
        """Start Codex CLI in JSON-RPC mode"""
        cmd = ["codex", "--jsonrpc"]
        
        if self.config.sandbox_mode:
            cmd.append("--sandbox")
        
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.config.working_dir,
            bufsize=1,
            universal_newlines=True
        )
        
        # Start response reader
        asyncio.create_task(self._read_responses())
    
    async def execute_task(self, task: Task) -> AsyncIterator[TaskUpdate]:
        """Submit task to Codex and stream updates"""
        import uuid
        
        task_id = str(uuid.uuid4())
        
        # Register approval handler if needed
        if self.config.approval_handler:
            self.approval_handlers[task_id] = self.config.approval_handler
        
        # Build Codex task request
        codex_task = {
            "jsonrpc": "2.0",
            "method": "tasks/send",
            "params": {
                "id": task_id,
                "sessionId": task.context.session_id or str(uuid.uuid4()),
                "message": {
                    "role": "user",
                    "parts": [{"text": task.description}]
                },
                "artifacts": self._build_artifacts(task.context.files)
            },
            "id": self._next_id()
        }
        
        self._send_message(codex_task)
        
        # Stream updates
        async for update in self._stream_task(task_id):
            yield update
    
    async def get_context(self) -> CodebaseContext:
        """Get context from Codex's view of the codebase"""
        # Codex doesn't expose direct context API
        # We infer from file system + recent tasks
        return await self._infer_context_from_fs()
    
    async def cancel_task(self, task_id: str):
        """Cancel a running Codex task"""
        request = {
            "jsonrpc": "2.0",
            "method": "tasks/cancel",
            "params": {"taskId": task_id},
            "id": self._next_id()
        }
        self._send_message(request)
    
    def _build_artifacts(self, files: list[FileContext]) -> list[dict]:
        """Convert file context to Codex artifacts"""
        return [
            {
                "filename": f.path,
                "content": f.content,
                "language": f.language
            }
            for f in files
        ]
    
    async def _read_responses(self):
        """Read and handle Codex responses"""
        while self.process and self.process.poll() is None:
            line = self.process.stdout.readline()
            if line:
                try:
                    response = json.loads(line)
                    await self._handle_response(response)
                except json.JSONDecodeError:
                    pass
    
    async def _handle_response(self, response: dict):
        """Handle Codex protocol responses"""
        method = response.get("method")
        
        if method == "approvals/request":
            await self._handle_approval_request(response)
        elif method == "tasks/update":
            await self._handle_task_update(response)
        elif "result" in response:
            await self._handle_task_result(response)
    
    async def _handle_approval_request(self, request: dict):
        """Handle approval request from Codex"""
        params = request.get("params", {})
        task_id = params.get("taskId")
        action = params.get("action")
        
        handler = self.approval_handlers.get(task_id, self.config.approval_handler)
        
        if handler:
            decision = await handler(action)
            
            approval_response = {
                "jsonrpc": "2.0",
                "method": "approvals/respond",
                "params": {
                    "taskId": task_id,
                    "approved": decision.get("approved", False),
                    "persistence": decision.get("persistence", "session")
                },
                "id": request.get("id")
            }
            self._send_message(approval_response)
    
    def _send_message(self, message: dict):
        """Send message to Codex stdin"""
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()
```

### 4.3 VS Code + Copilot Connector

```python
# connectors/vscode_copilot_connector.py
import subprocess
import json
import asyncio
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class VSCodeCopilotConfig:
    working_dir: str
    copilot_token: str
    preferred_model: str = "gpt-4"

class VSCodeCopilotConnector:
    """
    Connector for VS Code + GitHub Copilot via Language Server Protocol.
    Uses the official @github/copilot-language-server package.
    """
    
    def __init__(self, config: VSCodeCopilotConfig):
        self.config = config
        self.process = None
        self.request_id = 0
        self.pending = {}
    
    async def start(self):
        """Start Copilot Language Server"""
        self.process = subprocess.Popen(
            [
                "node",
                "./node_modules/@github/copilot-language-server/dist/language-server.js",
                "--stdio",
                "true"
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.config.working_dir,
            env={**os.environ, "GITHUB_TOKEN": self.config.copilot_token}
        )
        
        # Initialize LSP connection
        await self._initialize_lsp()
        
        # Start reader
        asyncio.create_task(self._read_messages())
    
    async def _initialize_lsp(self):
        """LSP handshake"""
        init_request = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "capabilities": {"workspace": {"workspaceFolders": True}},
                "initializationOptions": {
                    "editorInfo": {"name": "uacb", "version": "1.0.0"},
                    "editorPluginInfo": {"name": "uacb-copilot", "version": "1.0.0"}
                }
            }
        }
        
        await self._send_request(init_request)
        self._send_notification("initialized", {})
    
    async def get_completions(self, file_path: str, code: str, position: dict) -> list[dict]:
        """Get inline completions from Copilot"""
        # Open document
        self._send_notification("textDocument/didOpen", {
            "textDocument": {
                "uri": f"file://{file_path}",
                "languageId": self._detect_language(file_path),
                "version": 0,
                "text": code
            }
        })
        
        # Request completions
        response = await self._send_request({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "getCompletions",
            "params": {
                "doc": {
                    "uri": f"file://{file_path}",
                    "version": 0,
                    "position": position
                }
            }
        })
        
        return response.get("result", {}).get("completions", [])
    
    async def chat(self, message: str, context: list[dict] = None) -> AsyncIterator[str]:
        """Chat with Copilot"""
        # Create conversation
        conversation = await self._send_request({
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "conversation/create",
            "params": {
                "turns": [{"request": message}],
                "capabilities": {"allSkills": True},
                "workDoneToken": f"conv-{self._next_id()}"
            }
        })
        
        conversation_id = conversation.get("result", {}).get("conversationId")
        
        # Stream response
        async for chunk in self._stream_conversation(conversation_id):
            yield chunk
    
    async def _read_messages(self):
        """Read LSP messages from Copilot"""
        buffer = b""
        
        while self.process and self.process.poll() is None:
            chunk = self.process.stdout.read1(4096)
            if not chunk:
                break
            
            buffer += chunk
            
            # Parse LSP messages (Content-Length header)
            while True:
                header_end = buffer.find(b"\r\n\r\n")
                if header_end == -1:
                    break
                
                header = buffer[:header_end].decode("utf-8")
                content_length = None
                
                for line in header.split("\r\n"):
                    if line.lower().startswith("content-length:"):
                        content_length = int(line.split(":")[1].strip())
                
                if content_length is None:
                    buffer = buffer[header_end + 4:]
                    continue
                
                total_length = header_end + 4 + content_length
                
                if len(buffer) < total_length:
                    break
                
                body = buffer[header_end + 4:total_length].decode("utf-8")
                buffer = buffer[total_length:]
                
                try:
                    message = json.loads(body)
                    await self._handle_message(message)
                except json.JSONDecodeError:
                    pass
    
    def _send_message(self, message: dict):
        """Send LSP message with Content-Length header"""
        body = json.dumps(message)
        content_length = len(body.encode("utf-8"))
        
        full_message = f"Content-Length: {content_length}\r\n\r\n{body}"
        self.process.stdin.write(full_message.encode("utf-8"))
        self.process.stdin.flush()
```

### 4.4 Cursor Connector (File-Based)

```python
# connectors/cursor_connector.py
import os
import json
import asyncio
from pathlib import Path
from typing import AsyncIterator
from dataclasses import dataclass
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

@dataclass
class CursorConfig:
    working_dir: str
    cursorrules_path: str = ".cursorrules"

class CursorConnector:
    """
    Connector for Cursor IDE via file system.
    Cursor has no public API, so we use file-based integration.
    """
    
    def __init__(self, config: CursorConfig):
        self.config = config
        self.working_dir = Path(config.working_dir)
        self.observer = None
        self.file_changes = asyncio.Queue()
    
    async def start(self):
        """Start file system watcher"""
        handler = CursorFileHandler(self.file_changes)
        self.observer = Observer()
        self.observer.schedule(handler, str(self.working_dir), recursive=True)
        self.observer.start()
    
    async def execute_task(self, task: Task) -> AsyncIterator[TaskUpdate]:
        """
        Execute task by writing to files that Cursor will pick up.
        
        Strategy:
        1. Write task description to .cursor/prompts/{task_id}.md
        2. Cursor's agent mode will detect and process
        3. Watch for output files
        """
        import uuid
        
        task_id = str(uuid.uuid4())
        prompts_dir = self.working_dir / ".cursor" / "prompts"
        prompts_dir.mkdir(parents=True, exist_ok=True)
        
        # Write task prompt
        prompt_file = prompts_dir / f"{task_id}.md"
        prompt_content = self._build_prompt(task)
        prompt_file.write_text(prompt_content)
        
        # Watch for response
        response_file = prompts_dir / f"{task_id}_response.md"
        
        async for update in self._watch_for_response(response_file):
            yield update
    
    async def get_context(self) -> CodebaseContext:
        """Get context from Cursor's indexed files"""
        # Cursor stores index in .cursor directory
        cursor_dir = self.working_dir / ".cursor"
        
        if not cursor_dir.exists():
            return await self._build_context_from_fs()
        
        # Try to read Cursor's index if available
        index_file = cursor_dir / "index.json"
        if index_file.exists():
            index_data = json.loads(index_file.read_text())
            return self._parse_cursor_index(index_data)
        
        return await self._build_context_from_fs()
    
    def _build_prompt(self, task: Task) -> str:
        """Build prompt in Cursor format"""
        lines = [
            f"# Task: {task.description}",
            "",
            "## Context",
        ]
        
        for file in task.context.files:
            lines.extend([
                f"\n### {file.path}",
                f"```{file.language}",
                file.content,
                "```"
            ])
        
        lines.extend([
            "",
            "## Instructions",
            task.description,
            "",
            "---",
            "Response will be written to: {task_id}_response.md"
        ])
        
        return "\n".join(lines)
    
    async def _watch_for_response(self, response_file: Path) -> AsyncIterator[TaskUpdate]:
        """Watch for Cursor's response file"""
        max_wait = 300  # 5 minutes
        waited = 0
        
        while waited < max_wait:
            if response_file.exists():
                content = response_file.read_text()
                yield TaskUpdate(
                    state="completed",
                    content=content
                )
                return
            
            await asyncio.sleep(1)
            waited += 1
            
            yield TaskUpdate(
                state="running",
                progress=waited / max_wait,
                message=f"Waiting for Cursor... ({waited}s)"
            )
        
        yield TaskUpdate(
            state="failed",
            message="Timeout waiting for Cursor response"
        )
    
    async def set_cursorrules(self, rules: str):
        """Update .cursorrules file to guide Cursor behavior"""
        rules_file = self.working_dir / self.config.cursorrules_path
        rules_file.write_text(rules)


class CursorFileHandler(FileSystemEventHandler):
    """Watchdog handler for Cursor file changes"""
    
    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
    
    def on_modified(self, event):
        if not event.is_directory:
            asyncio.create_task(self.queue.put({
                "type": "modified",
                "path": event.src_path
            }))
```

### 4.5 Replit Connector

```python
# connectors/replit_connector.py
import httpx
import asyncio
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class ReplitConfig:
    api_token: str
    repl_id: str
    base_url: str = "https://api.replit.com"

class ReplitConnector:
    """
    Connector for Replit via REST API.
    Uses Replit AI Integrations API.
    """
    
    def __init__(self, config: ReplitConfig):
        self.config = config
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {config.api_token}"}
        )
    
    async def execute_task(self, task: Task) -> AsyncIterator[TaskUpdate]:
        """Execute task via Replit AI API"""
        
        # Use Replit Agent for code generation
        response = await self.client.post(
            f"{self.config.base_url}/v1/ai/agent",
            json={
                "repl_id": self.config.repl_id,
                "prompt": task.description,
                "context": {
                    "files": [f.path for f in task.context.files],
                    "conversation": [
                        {"role": m.role, "content": m.content}
                        for m in task.context.conversation
                    ]
                }
            }
        )
        
        result = response.json()
        task_id = result.get("task_id")
        
        # Poll for completion
        async for update in self._poll_task(task_id):
            yield update
    
    async def chat(self, message: str, model: str = "gpt-4") -> AsyncIterator[str]:
        """Chat with Replit AI"""
        
        response = await self.client.post(
            f"{self.config.base_url}/v1/ai/chat",
            json={
                "repl_id": self.config.repl_id,
                "message": message,
                "model": model
            }
        )
        
        result = response.json()
        
        # Stream response chunks
        for chunk in result.get("response", "").split():
            yield chunk + " "
            await asyncio.sleep(0.01)
    
    async def get_context(self) -> CodebaseContext:
        """Get Replit project context"""
        
        response = await self.client.get(
            f"{self.config.base_url}/v1/repls/{self.config.repl_id}/files"
        )
        
        files_data = response.json()
        
        return CodebaseContext(
            rootPath=f"replit://{self.config.repl_id}",
            language=files_data.get("language", "unknown"),
            structure=files_data.get("structure", {})
        )
    
    async def _poll_task(self, task_id: str) -> AsyncIterator[TaskUpdate]:
        """Poll Replit task status"""
        max_attempts = 60
        
        for attempt in range(max_attempts):
            response = await self.client.get(
                f"{self.config.base_url}/v1/ai/tasks/{task_id}"
            )
            
            result = response.json()
            status = result.get("status")
            
            if status == "completed":
                yield TaskUpdate(
                    state="completed",
                    content=result.get("output", ""),
                    files=result.get("files", [])
                )
                return
            elif status == "failed":
                yield TaskUpdate(
                    state="failed",
                    message=result.get("error", "Unknown error")
                )
                return
            
            yield TaskUpdate(
                state="running",
                progress=attempt / max_attempts,
                message=f"Processing... ({attempt}s)"
            )
            
            await asyncio.sleep(1)
```

---

## 5. Cross-Platform Workflows

### 5.1 Workflow: Multi-Agent Code Review

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW: MULTI-AGENT CODE REVIEW                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Developer writes code in Cursor                                                     │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  UACB detects file changes via Cursor Connector (File watcher)               │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Task Router analyzes change and creates sub-tasks:                          │    │
│  │                                                                              │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │    │
│  │  │  Task 1:        │  │  Task 2:        │  │  Task 3:        │              │    │
│  │  │  Security       │  │  Performance    │  │  Style/         │              │    │
│  │  │  Review         │  │  Analysis       │  │  Best Practices │              │    │
│  │  │  → Claude Code  │  │  → Codex        │  │  → VS Code      │              │    │
│  │  │                 │  │                 │  │    Copilot      │              │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Parallel execution via respective connectors                                │    │
│  │                                                                              │    │
│  │  Claude (MCP):          Codex (JSON-RPC):        Copilot (LSP):              │    │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐               │    │
│  │  │ Check for    │      │ Analyze time   │      │ Check style  │               │    │
│  │  │ SQL injection│      │ complexity     │      │ guidelines   │               │    │
│  │  │ XSS, secrets │      │ memory usage   │      │ patterns     │               │    │
│  │  └──────────────┘      └──────────────┘      └──────────────┘               │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Results Aggregator combines findings                                        │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Unified Review Report                                                  ││    │
│  │  │  ────────────────────                                                   ││    │
│  │  │  🔴 Security (Claude): 2 critical issues                                 ││    │
│  │  │     - Line 23: SQL injection vulnerability                              ││    │
│  │  │     - Line 45: Hardcoded API key                                        ││    │
│  │  │                                                                          ││    │
│  │  │  🟡 Performance (Codex): 1 warning                                       ││    │
│  │  │     - O(n²) loop could be optimized                                     ││    │
│  │  │                                                                          ││    │
│  │  │  🟢 Style (Copilot): No issues                                           ││    │
│  │  │                                                                          ││    │
│  │  │  Suggested Fix: [Codex-generated patch]                                  ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  Report delivered to developer in Cursor (via file update)                          │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Workflow: Cloud-to-Local Handoff

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW: CLOUD-TO-LOCAL HANDOFF                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Developer prototypes in Replit                                                      │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Replit Connector: Export project via Git                                    │    │
│  │  $ git clone https://replit.com/@user/project.git                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  UACB Context Bridge: Sync context to local environment                      │    │
│  │                                                                              │    │
│  │  Synced:                                                                     │    │
│  │  ✓ Project files                                                             │    │
│  │  ✓ Conversation history (as .uacb/history.json)                              │    │
│  │  ✓ AI-generated notes (as .uacb/notes.md)                                    │    │
│  │  ✓ Environment variables (encrypted)                                         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  Developer opens in VS Code                                                          │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  VS Code Copilot Connector: Restore context                                  │    │
│  │                                                                              │    │
│  │  Copilot now knows:                                                          │    │
│  │  - "We were building a React auth system"                                    │    │
│  │  - "The login component needs error handling"                                │    │
│  │  - "Using TypeScript with Tailwind CSS"                                      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  Developer continues work with full context preserved                                │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Workflow: Best-Tool-for-Job

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW: BEST-TOOL-FOR-JOB                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Developer: "Build a full-stack e-commerce app"                                      │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  UACB Orchestrator analyzes request and routes to optimal platforms:         │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Architecture & Planning → Claude Code                                  ││    │
│  │  │  "Design the system architecture, database schema, API structure"       ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  │           │                                                                  │    │
│  │           ▼                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Database Schema & Backend API → Codex                                  ││    │
│  │  │  "Generate Prisma schema and Express API endpoints"                     ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  │           │                                                                  │    │
│  │           ▼                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Frontend Components → Cursor (in Composer mode)                        ││    │
│  │  │  "Generate React components with Tailwind styling"                      ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  │           │                                                                  │    │
│  │           ▼                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Testing & QA → VS Code Copilot                                         ││    │
│  │  │  "Generate unit tests and integration tests"                            ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  │           │                                                                  │    │
│  │           ▼                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐│    │
│  │  │  Documentation → Replit Agent (for hosted docs)                         ││    │
│  │  │  "Generate API documentation and README"                                ││    │
│  │  └─────────────────────────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│           │                                                                          │
│           ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Results integrated into unified project structure                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Shared Infrastructure

### 6.1 Context Store

```python
# infrastructure/context_store.py
import sqlite3
import json
from datetime import datetime
from typing import Optional
from dataclasses import asdict

class ContextStore:
    """
    Persistent storage for codebase context, conversation history,
    and cross-platform state.
    """
    
    def __init__(self, db_path: str = ".uacb/context.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS codebases (
                    id TEXT PRIMARY KEY,
                    root_path TEXT UNIQUE,
                    language TEXT,
                    framework TEXT,
                    structure TEXT,  -- JSON
                    indexed_at TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    codebase_id TEXT,
                    platform TEXT,
                    messages TEXT,  -- JSON array
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    FOREIGN KEY (codebase_id) REFERENCES codebases(id)
                );
                
                CREATE TABLE IF NOT EXISTS file_contexts (
                    id TEXT PRIMARY KEY,
                    codebase_id TEXT,
                    path TEXT,
                    content_hash TEXT,
                    content TEXT,
                    language TEXT,
                    last_modified TIMESTAMP,
                    FOREIGN KEY (codebase_id) REFERENCES codebases(id)
                );
                
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    description TEXT,
                    platform TEXT,
                    status TEXT,
                    result TEXT,  -- JSON
                    created_at TIMESTAMP,
                    completed_at TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_codebases_path 
                    ON codebases(root_path);
                CREATE INDEX IF NOT EXISTS idx_conversations_codebase 
                    ON conversations(codebase_id);
                CREATE INDEX IF NOT EXISTS idx_file_contexts_codebase 
                    ON file_contexts(codebase_id);
            """)
    
    def save_codebase(self, context: CodebaseContext):
        """Save or update codebase context"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO codebases (id, root_path, language, framework, structure, indexed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(root_path) DO UPDATE SET
                    language=excluded.language,
                    framework=excluded.framework,
                    structure=excluded.structure,
                    indexed_at=excluded.indexed_at
            """, (
                context.id,
                context.rootPath,
                context.language,
                context.framework,
                json.dumps(context.structure),
                context.indexed_at
            ))
    
    def get_codebase(self, root_path: str) -> Optional[CodebaseContext]:
        """Retrieve codebase context"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM codebases WHERE root_path = ?",
                (root_path,)
            ).fetchone()
            
            if row:
                return CodebaseContext(
                    id=row[0],
                    rootPath=row[1],
                    language=row[2],
                    framework=row[3],
                    structure=json.loads(row[4]),
                    indexed_at=row[5]
                )
            return None
    
    def append_message(self, conversation_id: str, message: Message):
        """Append message to conversation"""
        with sqlite3.connect(self.db_path) as conn:
            # Get existing messages
            row = conn.execute(
                "SELECT messages FROM conversations WHERE id = ?",
                (conversation_id,)
            ).fetchone()
            
            messages = json.loads(row[0]) if row else []
            messages.append(asdict(message))
            
            conn.execute("""
                INSERT INTO conversations (id, messages, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    messages=excluded.messages,
                    updated_at=excluded.updated_at
            """, (conversation_id, json.dumps(messages), datetime.utcnow()))
    
    def get_conversation(self, conversation_id: str) -> list[Message]:
        """Get conversation history"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT messages FROM conversations WHERE id = ?",
                (conversation_id,)
            ).fetchone()
            
            if row:
                return [Message(**m) for m in json.loads(row[0])]
            return []
```

### 6.2 Vector Search

```python
# infrastructure/vector_search.py
from pinecone import Pinecone
import hashlib
from typing import list

class CodebaseVectorSearch:
    """
    Semantic search over codebase using vector embeddings.
    Enables "find all auth-related code" across platforms.
    """
    
    def __init__(self, api_key: str, index_name: str = "uacb-codebase"):
        self.pc = Pinecone(api_key=api_key)
        self.index = self.pc.Index(index_name)
    
    async def index_file(self, file: FileContext, codebase_id: str):
        """Index a file for semantic search"""
        # Split file into chunks (functions, classes)
        chunks = self._chunk_file(file)
        
        # Generate embeddings (using OpenAI or similar)
        embeddings = await self._generate_embeddings([c.content for c in chunks])
        
        # Upsert to Pinecone
        vectors = []
        for chunk, embedding in zip(chunks, embeddings):
            vector_id = hashlib.md5(
                f"{codebase_id}:{file.path}:{chunk.start_line}".encode()
            ).hexdigest()
            
            vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "codebase_id": codebase_id,
                    "file_path": file.path,
                    "language": file.language,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "content": chunk.content[:1000]  # Truncated
                }
            })
        
        self.index.upsert(vectors=vectors, namespace=codebase_id)
    
    async def search(
        self,
        query: str,
        codebase_id: str,
        top_k: int = 10
    ) -> list[SearchResult]:
        """Semantic search over codebase"""
        
        # Generate query embedding
        query_embedding = await self._generate_embeddings([query])
        
        # Search Pinecone
        results = self.index.query(
            vector=query_embedding[0],
            top_k=top_k,
            namespace=codebase_id,
            include_metadata=True
        )
        
        return [
            SearchResult(
                file_path=r.metadata["file_path"],
                content=r.metadata["content"],
                start_line=r.metadata["start_line"],
                end_line=r.metadata["end_line"],
                score=r.score
            )
            for r in results.matches
        ]
    
    def _chunk_file(self, file: FileContext) -> list[CodeChunk]:
        """Split file into semantic chunks"""
        # Use tree-sitter or simple heuristics
        lines = file.content.split("\n")
        chunks = []
        current_chunk = []
        start_line = 0
        
        for i, line in enumerate(lines):
            # Simple heuristic: chunk by function/class definitions
            if line.strip().startswith(("def ", "class ", "function ", "const ")):
                if current_chunk:
                    chunks.append(CodeChunk(
                        content="\n".join(current_chunk),
                        start_line=start_line,
                        end_line=i
                    ))
                current_chunk = [line]
                start_line = i
            else:
                current_chunk.append(line)
        
        if current_chunk:
            chunks.append(CodeChunk(
                content="\n".join(current_chunk),
                start_line=start_line,
                end_line=len(lines)
            ))
        
        return chunks
```

---

## 7. API Specification

### 7.1 REST API

```yaml
openapi: 3.0.0
info:
  title: Universal AI Coding Bridge API
  version: 1.0.0

paths:
  /tasks:
    post:
      summary: Submit a new task
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TaskRequest'
      responses:
        201:
          description: Task created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'

  /tasks/{taskId}:
    get:
      summary: Get task status and result
      parameters:
        - name: taskId
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: Task details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'

  /tasks/{taskId}/cancel:
    post:
      summary: Cancel a running task
      parameters:
        - name: taskId
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: Task cancelled

  /chat:
    post:
      summary: Send a chat message
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatRequest'
      responses:
        200:
          description: Chat response (streaming)
          content:
            text/event-stream:
              schema:
                type: string

  /context:
    get:
      summary: Get current codebase context
      parameters:
        - name: path
          in: query
          required: true
          schema:
            type: string
      responses:
        200:
          description: Codebase context
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CodebaseContext'

  /platforms:
    get:
      summary: List available platforms
      responses:
        200:
          description: List of platforms
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/PlatformCapabilities'

components:
  schemas:
    TaskRequest:
      type: object
      properties:
        description:
          type: string
        type:
          type: string
          enum: [generate, refactor, review, explain, test, debug]
        platform:
          type: string
        context:
          $ref: '#/components/schemas/ContextInput'
        constraints:
          $ref: '#/components/schemas/Constraints'

    Task:
      type: object
      properties:
        id:
          type: string
        status:
          $ref: '#/components/schemas/TaskStatus'
        result:
          $ref: '#/components/schemas/TaskResult'

    ChatRequest:
      type: object
      properties:
        message:
          type: string
        platform:
          type: string
        conversationId:
          type: string
        context:
          $ref: '#/components/schemas/ContextInput'
```

### 7.2 WebSocket API

```javascript
// Real-time collaboration via WebSocket

// Connect
const ws = new WebSocket('wss://uacb.example.com/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-api-token'
}));

// Subscribe to codebase updates
ws.send(JSON.stringify({
  type: 'subscribe',
  codebaseId: 'project-123'
}));

// Receive events
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'file.change':
      // File was modified by another platform
      console.log(`File ${message.path} changed via ${message.platform}`);
      break;
      
    case 'task.update':
      // Task status update
      console.log(`Task ${message.taskId}: ${message.status}`);
      break;
      
    case 'chat.message':
      // New chat message from any platform
      console.log(`${message.platform}: ${message.content}`);
      break;
      
    case 'context.sync':
      // Context was synced from another platform
      console.log(`Context synced from ${message.sourcePlatform}`);
      break;
  }
};

// Send chat message that appears across all platforms
ws.send(JSON.stringify({
  type: 'chat.send',
  content: 'Can someone review the auth module?',
  codebaseId: 'project-123'
}));
```

---

## 8. CLI Tool

### 8.1 Installation & Setup

```bash
# Install UACB CLI
npm install -g @uacb/cli

# Initialize in project
uacb init

# Configure platforms
uacb config add claude --working-dir ./my-project
uacb config add codex --working-dir ./my-project
uacb config add cursor --working-dir ./my-project
uacb config add vscode --copilot-token $COPILOT_TOKEN

# Verify connections
uacb doctor
```

### 8.2 CLI Commands

```bash
# Execute task on specific platform
uacb task --platform claude "Refactor the authentication module"

# Execute with best platform for task type
uacb task --type security "Review for vulnerabilities"

# Chat with any platform
uacb chat --platform codex "How do I implement JWT auth?"

# Sync context between platforms
uacb sync --from replit --to vscode

# Start collaboration session
uacb session start --name "Sprint 5 Feature Work"

# List active platforms
uacb platforms list

# View unified conversation history
uacb history --codebase ./my-project

# Export context for sharing
uacb export --format json > context.json

# Import context
uacb import --file context.json
```

### 8.3 Configuration File

```yaml
# .uacb/config.yaml
version: "1.0"

codebase:
  root: "."
  language: "typescript"
  framework: "nextjs"

platforms:
  claude:
    enabled: true
    working_dir: "."
    auto_approve: false
    allowed_tools: ["Read", "Write", "Edit", "Bash"]
    
  codex:
    enabled: true
    working_dir: "."
    sandbox_mode: true
    approval_handler: "interactive"
    
  cursor:
    enabled: true
    working_dir: "."
    cursorrules: ".cursorrules"
    
  vscode_copilot:
    enabled: true
    copilot_token: "${COPILOT_TOKEN}"
    preferred_model: "gpt-4"
    
  replit:
    enabled: false  # Cloud-only
    repl_id: ""
    api_token: "${REPLIT_TOKEN}"

sync:
  auto_sync: true
  sync_interval: 30  # seconds
  platforms: ["claude", "codex", "cursor"]

vector_search:
  enabled: true
  provider: "pinecone"
  api_key: "${PINECONE_API_KEY}"
  index_name: "uacb-codebase"

context:
  max_history: 100
  persist_conversations: true
  share_across_platforms: true
```

---

## 9. Security Considerations

### 9.1 Approval Workflows

```python
# security/approval_workflow.py
from enum import Enum
from typing import Callable

class ActionType(Enum):
    FILE_READ = "file:read"
    FILE_WRITE = "file:write"
    FILE_DELETE = "file:delete"
    BASH_EXEC = "bash:exec"
    NETWORK_CALL = "network:call"
    GIT_PUSH = "git:push"
    ENV_ACCESS = "env:access"

class ApprovalWorkflow:
    """
    Configurable approval system for sensitive operations.
    """
    
    def __init__(self):
        self.policies = {}
        self.handlers = {}
    
    def set_policy(
        self,
        platform: str,
        action: ActionType,
        rule: str  # "auto", "prompt", "deny"
    ):
        """Set approval policy for an action"""
        if platform not in self.policies:
            self.policies[platform] = {}
        self.policies[platform][action] = rule
    
    async def check(
        self,
        platform: str,
        action: ActionType,
        details: dict
    ) -> bool:
        """Check if action is approved"""
        rule = self.policies.get(platform, {}).get(action, "prompt")
        
        if rule == "auto":
            return True
        elif rule == "deny":
            return False
        elif rule == "prompt":
            handler = self.handlers.get(platform)
            if handler:
                return await handler(action, details)
            return False
        
        return False

# Default policies
DEFAULT_POLICIES = {
    "claude": {
        ActionType.FILE_READ: "auto",
        ActionType.FILE_WRITE: "prompt",
        ActionType.BASH_EXEC: "prompt",
        ActionType.NETWORK_CALL: "deny",
    },
    "codex": {
        ActionType.FILE_READ: "auto",
        ActionType.FILE_WRITE: "prompt",
        ActionType.BASH_EXEC: "prompt",
        ActionType.NETWORK_CALL: "prompt",  # Codex has sandbox
    },
    "cursor": {
        ActionType.FILE_READ: "auto",
        ActionType.FILE_WRITE: "auto",  # Cursor is IDE-native
        ActionType.BASH_EXEC: "prompt",
    }
}
```

### 9.2 Secrets Management

```python
# security/secrets_manager.py
from cryptography.fernet import Fernet
import os

class SecretsManager:
    """
    Secure storage for API keys and tokens.
    """
    
    def __init__(self, master_key: str = None):
        self.key = master_key or os.environ.get("UACB_MASTER_KEY")
        if not self.key:
            raise ValueError("Master key required")
        self.cipher = Fernet(self.key)
    
    def store(self, name: str, value: str):
        """Encrypt and store secret"""
        encrypted = self.cipher.encrypt(value.encode())
        
        # Store in OS keychain or encrypted file
        self._save_to_storage(name, encrypted)
    
    def retrieve(self, name: str) -> str:
        """Retrieve and decrypt secret"""
        encrypted = self._load_from_storage(name)
        return self.cipher.decrypt(encrypted).decode()
    
    def _save_to_storage(self, name: str, encrypted: bytes):
        """Save to platform-specific secure storage"""
        import keyring
        keyring.set_password("uacb", name, encrypted.decode())
    
    def _load_from_storage(self, name: str) -> bytes:
        """Load from platform-specific secure storage"""
        import keyring
        return keyring.get_password("uacb", name).encode()
```

---

## 10. Deployment

### 10.1 Docker Compose

```yaml
# docker-compose.yaml
version: '3.8'

services:
  uacb-api:
    build: ./api
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://uacb:password@postgres:5432/uacb
      - REDIS_URL=redis://redis:6379
      - PINECONE_API_KEY=${PINECONE_API_KEY}
    volumes:
      - ./projects:/projects
    depends_on:
      - postgres
      - redis

  uacb-websocket:
    build: ./websocket
    ports:
      - "8081:8081"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=uacb
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=uacb
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  vector-db:
    image: pinecone/pinecone-local:latest
    ports:
      - "5080:5080"
    volumes:
      - pinecone_data:/data

volumes:
  postgres_data:
  redis_data:
  pinecone_data:
```

### 10.2 Kubernetes

```yaml
# k8s/uacb-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uacb-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: uacb-api
  template:
    metadata:
      labels:
        app: uacb-api
    spec:
      containers:
      - name: api
        image: uacb/api:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: uacb-secrets
              key: database-url
        - name: PINECONE_API_KEY
          valueFrom:
            secretKeyRef:
              name: uacb-secrets
              key: pinecone-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
---
apiVersion: v1
kind: Service
metadata:
  name: uacb-api
spec:
  selector:
    app: uacb-api
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

---

## 11. Roadmap

**Scope lock note (2026-02-15):**
- Tier-1 active connectors: `codex`, `claude`.
- `cursor`, `windsurf`, `replit`, `vscode-copilot`, `jetbrains`, and other connectors are Tier-2 backlog.
- Tier-2 promotion is blocked until no-skip Phase 3 closeout passes.

### Phase 1: Foundation (Q1 2026)
- [ ] Core protocol adapters (MCP, JSON-RPC, LSP)
- [ ] Claude Code connector
- [ ] Codex CLI connector
- [ ] VS Code + Copilot connector
- [ ] File-based connectors (Cursor, Windsurf)
- [ ] Context store and sync
- [ ] CLI tool v1

### Phase 2: Integration (Q2 2026)
- [ ] Replit connector
- [ ] recoder.xyz connector
- [ ] Vector search implementation
- [ ] WebSocket real-time sync
- [ ] REST API v1
- [ ] Web dashboard
- [ ] VS Code extension

### Phase 3: Intelligence (Q3 2026)
- [ ] Task routing intelligence
- [ ] Best-platform-for-task detection
- [ ] Multi-agent orchestration
- [ ] Learning from user preferences
- [ ] Custom connector SDK
- [ ] Plugin marketplace

### Phase 4: Ecosystem (Q4 2026)
- [ ] JetBrains plugin
- [ ] Vim/Neovim plugin
- [ ] Emacs integration
- [ ] CI/CD integrations
- [ ] Team collaboration features
- [ ] Enterprise SSO & audit

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **UACB** | Universal AI Coding Bridge |
| **MCP** | Model Context Protocol (Anthropic) |
| **LSP** | Language Server Protocol (Microsoft) |
| **A2A** | Agent-to-Agent Protocol (Google/LF) |
| **Connector** | Platform-specific integration module |
| **Context** | Project state, files, conversation history |
| **Task** | Unit of work submitted to a platform |

### 12.2 Related Projects

- **A2A Protocol**: https://github.com/google/A2A
- **MCP Specification**: https://modelcontextprotocol.io/
- **Claude Code**: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview
- **Codex CLI**: https://github.com/openai/codex
- **Copilot Language Server**: https://www.npmjs.com/package/@github/copilot-language-server

---

*End of Document*
