# Agent-to-Agent Communication: Technical PRD
## Connecting Codex, Claude Code & Building "Slack for Agents"

**Version:** 1.1  
**Date:** February 15, 2026  
**Status:** Draft reference PRD (canonical architecture moved)

**Canonical architecture:** `shared/src/a2a/UNIFIED_A2A_UACB_ARCHITECTURE.md`  
**Execution lock:** Tier-1 connectors only (`codex`, `claude`) until no-skip Phase 3 closeout is complete.

---

## 1. Executive Summary

This document outlines the technical architecture and implementation strategy for enabling seamless agent-to-agent (A2A) communication, with specific focus on:

1. **Codex ↔ Claude Code Integration**: Bridging OpenAI's Codex CLI with Anthropic's Claude Code through standardized protocols
2. **"Slack for Agents"**: A messaging infrastructure that enables AI agents to collaborate in channels, threads, and direct messages—just like human teams

The solution leverages emerging open standards (A2A Protocol, MCP) combined with proven messaging patterns to create an interoperable, scalable multi-agent ecosystem.

This PRD remains the detailed reference for control-plane concepts. Runtime ownership and support decisions are governed by the unified architecture document and blueprint release gates.

---

## 2. Problem Statement

### 2.1 Current Landscape

| Challenge | Impact |
|-----------|--------|
| **Siloed Agents** | Codex, Claude Code, and other agents operate in isolation, unable to collaborate |
| **No Common Language** | Each framework uses proprietary APIs and communication patterns |
| **Context Loss** | Agents cannot share state, memory, or intermediate results across boundaries |
| **Human-Agent Friction** | Humans must manually bridge agent outputs, creating bottlenecks |
| **Last-Mile Problem** | Multi-agent prototypes fail to integrate into real enterprise workflows |

### 2.2 Use Cases

1. **Cross-Platform Development**: Codex writes code → Claude Code reviews security → Human approves
2. **Research & Synthesis**: Web research agent gathers data → Analysis agent synthesizes → Writer agent drafts report
3. **Customer Service**: Triage agent classifies → Technical agent troubleshoots → Sales agent upsells
4. **Code Migration**: Legacy code analysis (Codex) → Security audit (Claude) → Documentation generation (specialized agent)

---

## 3. Solution Overview

### 3.1 Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT MESSAGING BUS (AMB)                           │
│                    "Slack for Agents" - Central Nervous System               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Channel   │  │   Thread    │  │    DM       │  │   Agent Registry    │ │
│  │  (public)   │  │  (nested)   │  │ (private)   │  │  (Agent Cards)      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
┌───────▼────────┐          ┌───────────▼──────────┐      ┌───────────▼────────┐
│   CODEX AGENT  │          │   CLAUDE AGENT       │      │   OTHER AGENTS     │
│   (via CLI)    │◄────────►│   (via MCP/A2A)      │◄────►│   (A2A compatible) │
└────────────────┘          └──────────────────────┘      └────────────────────┘
        │                              │                              │
        └──────────────────────────────┴──────────────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  PROTOCOL LAYER │
                              │  (A2A + MCP)    │
                              └─────────────────┘
```

### 3.2 Key Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Agent Messaging Bus (AMB)** | Central message routing, channels, threads | Kafka/Redis Streams + Custom API |
| **Agent Registry** | Capability discovery via "Agent Cards" | A2A Protocol + JSON-LD |
| **Protocol Gateway** | Translate between agent-specific protocols | A2A + MCP adapters |
| **Context Bridge** | Share state/memory across agents | Shared vector DB + Event sourcing |
| **Approval Layer** | Human-in-the-loop for critical actions | Web UI + Slack integration |

---

## 4. Protocol Stack: A2A + MCP

### 4.1 Protocol Comparison

| Aspect | **A2A (Agent-to-Agent)** | **MCP (Model Context Protocol)** |
|--------|--------------------------|----------------------------------|
| **Purpose** | Agent collaboration & task delegation | Tool/resource access for agents |
| **Analogy** | "Slack for agents" — how agents talk | "USB-C for AI" — how agents plug in tools |
| **Scope** | Inter-agent communication | Agent-to-tool/data communication |
| **State** | Stateful (task lifecycle management) | Stateless (immediate execution) |
| **Discovery** | Agent Cards (capability manifests) | Tool schemas |
| **Transport** | HTTP + SSE, JSON-RPC | STDIO, HTTP+SSE |
| **Maintainer** | Google → Linux Foundation | Anthropic → Open Standard |

### 4.2 How They Work Together

```
┌────────────────────────────────────────────────────────────────┐
│                    COMPLETE AGENT WORKFLOW                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      A2A Protocol      ┌─────────────┐        │
│  │   Agent A   │◄──────────────────────►│   Agent B   │        │
│  │  (Planner)  │   "Please research X"  │ (Researcher)│        │
│  └──────┬──────┘                        └──────┬──────┘        │
│         │                                       │               │
│         │ MCP Protocol                          │ MCP Protocol  │
│         ▼                                       ▼               │
│  ┌─────────────┐                        ┌─────────────┐        │
│  │  Database   │                        │  Web Search │        │
│  │   (Tool)    │                        │   (Tool)    │        │
│  └─────────────┘                        └─────────────┘        │
│                                                                 │
│  A2A = HOW agents collaborate                                   │
│  MCP = WHAT tools agents can use                                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 4.3 A2A Core Concepts

**Agent Card** (Capability Manifest):
```json
{
  "id": "codex-agent-v1",
  "name": "OpenAI Codex",
  "description": "Autonomous coding agent with full codebase access",
  "version": "2025-02",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "code-generation",
      "name": "Code Generation",
      "description": "Generate code from natural language descriptions",
      "tags": ["coding", "typescript", "python"],
      "examples": ["Create a React component", "Refactor this function"]
    },
    {
      "id": "code-review",
      "name": "Code Review",
      "description": "Review code for bugs, style, and best practices",
      "tags": ["review", "quality"]
    }
  ],
  "authentication": {
    "schemes": ["bearer"]
  },
  "endpoint": {
    "url": "https://codex-agent.internal/a2a",
    "contentType": "application/json"
  }
}
```

**Task Lifecycle**:
```
submitted → working → input-required → working → completed
                ↓           ↑
            awaiting      providing
            agent         clarification
            response
```

---

## 5. Codex ↔ Claude Code Integration

### 5.1 Codex CLI Architecture

Codex operates as an **App Server** with JSON-RPC over stdio:

```
┌─────────────────────────────────────────────────────────────┐
│                    CODEX APP SERVER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐      JSON-RPC/stdio      ┌─────────────┐  │
│  │   Client    │◄────────────────────────►│  Codex Core │  │
│  │  (any app)  │   tasks/approvals/events │   (Rust)    │  │
│  └─────────────┘                          └─────────────┘  │
│                                                             │
│  Methods:                                                   │
│  - tasks/send       - Submit a task                        │
│  - tasks/get        - Get task status/result               │
│  - tasks/cancel     - Cancel running task                  │
│  - approvals/respond - Approve/reject action               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Claude Code MCP Server Mode

Claude Code can run as an MCP server:

```bash
# Start Claude Code as stdio MCP server
claude mcp serve
```

This exposes Claude's capabilities via MCP protocol, allowing other applications to:
- Send prompts for processing
- Execute tools through Claude
- Access Claude's reasoning capabilities

### 5.3 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              CODEX ↔ CLAUDE INTEGRATION ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                        ┌─────────────────┐     │
│  │   CODEX CLI     │                        │   CLAUDE CODE   │     │
│  │   (App Server)  │                        │   (MCP Server)  │     │
│  │                 │                        │                 │     │
│  │  JSON-RPC/stdio │◄────── BRIDGE ───────►│  MCP/stdio      │     │
│  │  (Task-based)   │    (Protocol Adapter)  │  (Tool-based)   │     │
│  └────────┬────────┘                        └────────┬────────┘     │
│           │                                          │              │
│           │    ┌─────────────────────────────┐       │              │
│           └───►│      A2A GATEWAY            │◄──────┘              │
│                │  (Protocol Translation)     │                      │
│                │                             │                      │
│                │  • Converts Codex Tasks     │                      │
│                │    ↔ Claude MCP Tools       │                      │
│                │  • Manages approval flows   │                      │
│                │  • Handles streaming        │                      │
│                └─────────────────────────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 Protocol Translation Layer

The bridge translates between:

| Codex (A2A-style) | Claude (MCP) |
|-------------------|--------------|
| `tasks/send` | `tools/call` with prompt |
| Task object with lifecycle | Immediate tool execution |
| Streaming updates via SSE | Streaming via SSE |
| Approval requests | No built-in approval (handled externally) |
| File operations | File system tools |

**Example Translation**:

```python
# Codex sends a task
codex_task = {
    "id": "task-123",
    "sessionId": "session-456",
    "message": {
        "role": "user",
        "parts": [{"text": "Review this code for security issues"}]
    },
    "artifacts": [{
        "filename": "auth.ts",
        "content": "...code..."
    }]
}

# Bridge converts to Claude MCP format
claude_request = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
        "name": "security_review",
        "arguments": {
            "code": "...code...",
            "language": "typescript",
            "focus": "security"
        }
    }
}
```

---

## 6. "Slack for Agents" Design

### 6.1 Core Concepts

| Slack Concept | Agent Equivalent | Implementation |
|---------------|------------------|----------------|
| **Workspace** | Agent Ecosystem | Registry of all agents |
| **Channel** | Topic Channel | Kafka topic / Redis channel |
| **Thread** | Task Thread | Nested message stream |
| **DM** | Direct Agent Communication | Private A2A session |
| **@mention** | Agent Invocation | `@{agent_id}` routing |
| **Reaction** | Agent Acknowledgment | Message metadata |
| **Status** | Agent State | Task lifecycle updates |

### 6.2 Agent Types

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT ROLES IN CHANNELS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  ASSISTANT      │  │  WORKFLOW       │  │  PROACTIVE      │ │
│  │  AGENT          │  │  AGENT          │  │  AGENT          │ │
│  │                 │  │                 │  │                 │ │
│  │ Responds to     │  │ Manages multi-  │  │ Monitors        │ │
│  │ direct @mentions│  │ step workflows  │  │ channels,       │ │
│  │ and DMs         │  │ with state      │  │ offers help     │ │
│  │                 │  │ management      │  │ proactively     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  Example: Customer Service Team                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Customer   │───►│   Service   │───►│  Logistics  │         │
│  │   (Human)   │    │   Agent     │    │   Agent     │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                     │
│                            └────────►┌─────────────┐            │
│                                      │   Sales     │            │
│                                      │   Agent     │            │
│                                      └─────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Message Protocol

```json
{
  "message_id": "msg-uuid",
  "timestamp": "2026-02-14T10:30:00Z",
  "channel_id": "channel-uuid",
  "thread_id": "thread-uuid",
  "sender": {
    "agent_id": "codex-agent-v1",
    "agent_name": "Codex",
    "type": "agent"
  },
  "recipients": ["@claude-agent", "@human-user"],
  "content": {
    "type": "task_request",
    "text": "@claude-agent Please review this authentication module",
    "artifacts": [
      {
        "type": "code",
        "filename": "auth.ts",
        "content": "...",
        "language": "typescript"
      }
    ]
  },
  "metadata": {
    "priority": "high",
    "task_id": "task-uuid",
    "requires_approval": true
  }
}
```

### 6.4 Collaboration Patterns

**Pattern 1: Direct Handoff**
```
Human: "@codex Generate a login form"
  ↓
Codex: [generates code]
  ↓
Human: "@claude Review this for security"
  ↓
Claude: [reviews, finds issues]
  ↓
Claude: "@codex Fix the SQL injection vulnerability on line 23"
  ↓
Codex: [fixes code]
```

**Pattern 2: Supervisor Orchestration**
```
Human: "@supervisor Build a complete auth system"
  ↓
Supervisor: Creates plan, delegates tasks
  ├─► @codex: "Generate login UI"
  ├─► @codex: "Generate backend API"
  └─► @claude: "Review security of both components"
  ↓
Supervisor: Integrates results, presents to human
```

**Pattern 3: Competitive Pattern**
```
Human: "Generate 3 taglines for our product"
  ↓
[3 Writer agents work in parallel]
  ├─► Writer A: "Tagline A"
  ├─► Writer B: "Tagline B"
  └─► Writer C: "Tagline C"
  ↓
@evaluator: Selects best option
```

---

## 7. Technical Implementation

### 7.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         API GATEWAY                                  │   │
│  │              (Rate limiting, Auth, Request routing)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────▼─────────────────────────────────────┐   │
│  │                    AGENT MESSAGING BUS (AMB)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │   Kafka     │  │   Redis     │  │  Registry   │  │   Event     │ │   │
│  │  │  (Topics)   │  │  (State)    │  │  (Agents)   │  │   Store     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│       ┌────────────────────────────┼────────────────────────────┐           │
│       │                            │                            │           │
│  ┌────▼────┐                 ┌─────▼─────┐                ┌─────▼────┐     │
│  │  CODEX  │                 │  CLAUDE   │                │ CUSTOM   │     │
│  │  AGENT  │                 │  AGENT    │                │  AGENTS  │     │
│  │         │                 │           │                │          │     │
│  │ ┌─────┐ │                 │ ┌───────┐ │                │ ┌──────┐ │     │
│  │ │CLI  │ │                 │ │MCP    │ │                │ │A2A   │ │     │
│  │ │Proc │ │                 │ │Server │ │                │ │Server│ │     │
│  │ └──┬──┘ │                 │ └───┬───┘ │                │ └──┬───┘ │     │
│  │    │    │                 │     │     │                │    │     │     │
│  │ ┌──▼──┐ │                 │ ┌───▼───┐ │                │ ┌──▼──┐ │     │
│  │ │A2A  │ │◄───────────────►│ │A2A    │ │◄──────────────►│ │A2A  │ │     │
│  │ │Adapt│ │                 │ │Adapter│ │                │ │     │ │     │
│  │ └─────┘ │                 │ └───────┘ │                │ └─────┘ │     │
│  └─────────┘                 └───────────┘                └─────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SHARED INFRASTRUCTURE                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  PostgreSQL │  │  Pinecone   │  │   MinIO     │  │  Prometheus │ │   │
│  │  │  (Metadata) │  │  (Vectors)  │  │  (Artifacts)│  │  (Metrics)  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Core Services

#### 7.2.1 Agent Registry Service

```python
# agent_registry.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import json

app = FastAPI()

class AgentCard(BaseModel):
    id: str
    name: str
    description: str
    version: str
    endpoint: str
    capabilities: List[str]
    authentication: dict
    skills: List[dict]

class AgentRegistry:
    def __init__(self):
        self.agents = {}
        self.capability_index = {}
    
    def register(self, card: AgentCard):
        """Register an agent with its capabilities"""
        self.agents[card.id] = card
        
        # Index by capability for discovery
        for cap in card.capabilities:
            if cap not in self.capability_index:
                self.capability_index[cap] = []
            self.capability_index[cap].append(card.id)
    
    def discover(self, capability: str) -> List[AgentCard]:
        """Find agents with specific capability"""
        agent_ids = self.capability_index.get(capability, [])
        return [self.agents[aid] for aid in agent_ids]
    
    def get_agent(self, agent_id: str) -> Optional[AgentCard]:
        return self.agents.get(agent_id)

registry = AgentRegistry()

@app.post("/register")
async def register_agent(card: AgentCard):
    registry.register(card)
    return {"status": "registered", "id": card.id}

@app.get("/discover/{capability}")
async def discover_agents(capability: str):
    return registry.discover(capability)

@app.get("/agent/{agent_id}")
async def get_agent_card(agent_id: str):
    return registry.get_agent(agent_id)
```

#### 7.2.2 Message Bus Service

```python
# message_bus.py
from kafka import KafkaProducer, KafkaConsumer
import json
from typing import Callable
import asyncio

class AgentMessageBus:
    def __init__(self, bootstrap_servers='localhost:9092'):
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        self.consumers = {}
        self.handlers = {}
    
    async def publish(self, channel: str, message: dict):
        """Publish message to a channel"""
        self.producer.send(channel, message)
        self.producer.flush()
    
    def subscribe(self, channel: str, handler: Callable):
        """Subscribe to a channel with a handler"""
        if channel not in self.consumers:
            self.consumers[channel] = KafkaConsumer(
                channel,
                bootstrap_servers='localhost:9092',
                value_deserializer=lambda v: json.loads(v.decode('utf-8')),
                group_id=f'agent-group-{channel}'
            )
            self.handlers[channel] = handler
    
    async def start_consuming(self):
        """Start consuming messages"""
        for channel, consumer in self.consumers.items():
            handler = self.handlers[channel]
            for message in consumer:
                await handler(message.value)
    
    async def send_dm(self, from_agent: str, to_agent: str, message: dict):
        """Send direct message between agents"""
        dm_channel = f"dm:{min(from_agent, to_agent)}:{max(from_agent, to_agent)}"
        await self.publish(dm_channel, {
            "from": from_agent,
            "to": to_agent,
            "content": message,
            "timestamp": datetime.utcnow().isoformat()
        })

# Usage
bus = AgentMessageBus()

async def handle_code_request(message):
    if "@codex" in message.get("content", ""):
        # Route to Codex agent
        await process_codex_task(message)

bus.subscribe("dev-channel", handle_code_request)
```

#### 7.2.3 A2A Gateway (Protocol Bridge)

```python
# a2a_gateway.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import httpx
import asyncio

app = FastAPI()

class Task(BaseModel):
    id: str
    sessionId: str
    message: Dict[str, Any]
    artifacts: Optional[list] = []

class TaskStatus(BaseModel):
    state: str  # submitted, working, input-required, completed, canceled
    message: Optional[Dict[str, Any]] = None

class A2AGateway:
    """
    Translates between A2A protocol and agent-specific protocols (MCP, Codex JSON-RPC)
    """
    def __init__(self):
        self.active_tasks = {}
        self.agent_clients = {}
    
    async def submit_task(self, agent_id: str, task: Task) -> TaskStatus:
        """Submit task to an agent via appropriate protocol"""
        agent = await self.get_agent(agent_id)
        
        if agent.protocol == "a2a":
            return await self._submit_a2a(agent, task)
        elif agent.protocol == "mcp":
            return await self._submit_mcp(agent, task)
        elif agent.protocol == "codex":
            return await self._submit_codex(agent, task)
        else:
            raise HTTPException(400, f"Unknown protocol: {agent.protocol}")
    
    async def _submit_a2a(self, agent, task: Task) -> TaskStatus:
        """Submit to A2A-compatible agent"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{agent.endpoint}/tasks/send",
                json=task.dict()
            )
            return TaskStatus(**response.json())
    
    async def _submit_mcp(self, agent, task: Task) -> TaskStatus:
        """Submit to MCP server (like Claude Code)"""
        # Convert A2A task to MCP tool call
        mcp_request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": task.message.get("tool", "process"),
                "arguments": {
                    "prompt": task.message.get("parts", [{}])[0].get("text", ""),
                    "artifacts": task.artifacts
                }
            },
            "id": task.id
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                agent.endpoint,
                json=mcp_request
            )
            
            # Convert MCP response back to A2A status
            result = response.json()
            return TaskStatus(
                state="completed",
                message={
                    "role": "agent",
                    "parts": [{"text": result.get("result", {}).get("content", "")}]
                }
            )
    
    async def _submit_codex(self, agent, task: Task) -> TaskStatus:
        """Submit to Codex CLI via JSON-RPC over subprocess"""
        import subprocess
        
        # Spawn Codex CLI as subprocess
        codex_input = {
            "jsonrpc": "2.0",
            "method": "tasks/send",
            "params": {
                "message": task.message,
                "artifacts": task.artifacts
            },
            "id": task.id
        }
        
        proc = subprocess.Popen(
            ["codex", "--jsonrpc"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Send task
        proc.stdin.write(json.dumps(codex_input) + "\n")
        proc.stdin.flush()
        
        # Read response (streaming handled separately)
        response = proc.stdout.readline()
        result = json.loads(response)
        
        return TaskStatus(
            state="working" if result.get("streaming") else "completed",
            message=result.get("message")
        )

gateway = A2AGateway()

@app.post("/a2a/tasks/send")
async def send_task(agent_id: str, task: Task):
    return await gateway.submit_task(agent_id, task)

@app.get("/a2a/tasks/{task_id}")
async def get_task_status(task_id: str):
    return gateway.active_tasks.get(task_id)
```

### 7.3 Codex Integration Module

```python
# codex_integration.py
import subprocess
import json
import asyncio
from typing import AsyncIterator, Callable

class CodexIntegration:
    """
    Integrates Codex CLI as an A2A-compatible agent.
    Spawns Codex as subprocess and communicates via JSON-RPC over stdio.
    """
    
    def __init__(self, workspace_dir: str = "."):
        self.workspace_dir = workspace_dir
        self.process = None
        self.approval_handlers = {}
    
    async def start(self):
        """Start Codex App Server as subprocess"""
        self.process = subprocess.Popen(
            ["codex", "--jsonrpc", "--workspace", self.workspace_dir],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            universal_newlines=True
        )
        
        # Start response reader
        asyncio.create_task(self._read_responses())
    
    async def _read_responses(self):
        """Continuously read responses from Codex"""
        while self.process and self.process.poll() is None:
            line = self.process.stdout.readline()
            if line:
                response = json.loads(line)
                await self._handle_response(response)
    
    async def _handle_response(self, response: dict):
        """Handle different response types"""
        method = response.get("method")
        
        if method == "approvals/request":
            # Handle approval request
            await self._handle_approval_request(response)
        elif "result" in response:
            # Task result
            await self._handle_task_result(response)
    
    async def _handle_approval_request(self, request: dict):
        """Route approval request to appropriate handler"""
        task_id = request["params"]["taskId"]
        action = request["params"]["action"]
        
        if task_id in self.approval_handlers:
            handler = self.approval_handlers[task_id]
            decision = await handler(action)
            
            # Send approval response
            approval_response = {
                "jsonrpc": "2.0",
                "method": "approvals/respond",
                "params": {
                    "taskId": task_id,
                    "approved": decision["approved"],
                    "persistence": decision.get("persistence", "session")
                },
                "id": request["id"]
            }
            await self._send(approval_response)
    
    async def submit_task(
        self, 
        prompt: str, 
        artifacts: list = None,
        on_approval: Callable = None
    ) -> AsyncIterator[dict]:
        """
        Submit task to Codex and stream updates.
        
        Args:
            prompt: Natural language instruction
            artifacts: Files/context to include
            on_approval: Callback for approval requests
        """
        task_id = f"task-{uuid.uuid4()}"
        
        if on_approval:
            self.approval_handlers[task_id] = on_approval
        
        request = {
            "jsonrpc": "2.0",
            "method": "tasks/send",
            "params": {
                "id": task_id,
                "message": {
                    "role": "user",
                    "parts": [{"text": prompt}]
                },
                "artifacts": artifacts or []
            },
            "id": task_id
        }
        
        await self._send(request)
        
        # Yield streaming updates
        async for update in self._stream_updates(task_id):
            yield update
    
    async def _send(self, message: dict):
        """Send message to Codex stdin"""
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()
    
    async def _stream_updates(self, task_id: str) -> AsyncIterator[dict]:
        """Stream task updates"""
        # Implementation would use SSE or similar
        pass

# Usage Example
async def main():
    codex = CodexIntegration(workspace_dir="./my-project")
    await codex.start()
    
    async for update in codex.submit_task(
        prompt="Create a login form component",
        artifacts=[{"filename": "styles.css", "content": "..."}],
        on_approval=lambda action: {
            "approved": True,
            "persistence": "session"
        }
    ):
        print(update)
```

### 7.4 Claude Code Integration Module

```python
# claude_integration.py
import subprocess
import json
import asyncio
from typing import AsyncIterator, List, Dict

class ClaudeCodeIntegration:
    """
    Integrates Claude Code as an MCP server for A2A communication.
    """
    
    def __init__(self, working_dir: str = "."):
        self.working_dir = working_dir
        self.process = None
        self.tools = []
    
    async def start_mcp_server(self):
        """Start Claude Code in MCP server mode"""
        self.process = subprocess.Popen(
            ["claude", "mcp", "serve"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.working_dir,
            bufsize=1,
            universal_newlines=True
        )
        
        # Initialize MCP connection
        await self._initialize_mcp()
    
    async def _initialize_mcp(self):
        """Perform MCP handshake"""
        init_request = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "a2a-gateway",
                    "version": "1.0.0"
                }
            },
            "id": 0
        }
        
        response = await self._send_request(init_request)
        self.tools = response.get("result", {}).get("capabilities", {}).get("tools", [])
    
    async def execute_tool(self, tool_name: str, arguments: dict) -> dict:
        """Execute a tool via MCP"""
        request = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": self._next_id()
        }
        
        return await self._send_request(request)
    
    async def review_code(self, code: str, language: str = "python") -> str:
        """Specialized method for code review"""
        result = await self.execute_tool(
            tool_name="code_review",
            arguments={
                "code": code,
                "language": language,
                "focus": ["security", "performance", "best_practices"]
            }
        )
        
        return result.get("result", {}).get("content", "")
    
    async def analyze_security(self, code: str) -> Dict:
        """Security-focused analysis"""
        result = await self.execute_tool(
            tool_name="security_analysis",
            arguments={
                "code": code,
                "check_types": ["sql_injection", "xss", "command_injection", "secrets"]
            }
        )
        
        return result.get("result", {})
    
    async def _send_request(self, request: dict) -> dict:
        """Send MCP request and wait for response"""
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        
        # Read response line
        response_line = self.process.stdout.readline()
        return json.loads(response_line)
    
    def _next_id(self) -> int:
        """Generate next request ID"""
        import itertools
        if not hasattr(self, '_id_counter'):
            self._id_counter = itertools.count()
        return next(self._id_counter)

# Usage Example
async def main():
    claude = ClaudeCodeIntegration(working_dir="./my-project")
    await claude.start_mcp_server()
    
    # Review code from Codex
    code = """
    def login(username, password):
        query = f"SELECT * FROM users WHERE username='{username}'"
        return db.execute(query)
    """
    
    review = await claude.review_code(code, language="python")
    security = await claude.analyze_security(code)
    
    print("Review:", review)
    print("Security Issues:", security.get("issues", []))
```

---

## 8. "Slack for Agents" Implementation

### 8.1 Channel-Based Collaboration Service

```python
# slack_for_agents.py
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
from typing import List, Dict, Optional
from enum import Enum
import asyncio
import json

app = FastAPI()

class MessageType(str, Enum):
    TEXT = "text"
    TASK_REQUEST = "task_request"
    TASK_RESPONSE = "task_response"
    ARTIFACT = "artifact"
    APPROVAL_REQUEST = "approval_request"
    APPROVAL_RESPONSE = "approval_response"
    SYSTEM = "system"

class AgentMessage(BaseModel):
    id: str
    channel_id: str
    thread_id: Optional[str] = None
    sender_id: str
    sender_type: str  # "human", "agent", "system"
    recipient_ids: List[str] = []  # Empty = broadcast
    message_type: MessageType
    content: str
    artifacts: List[Dict] = []
    metadata: Dict = {}
    timestamp: str

class AgentChannel:
    """Represents a channel where agents and humans collaborate"""
    
    def __init__(self, channel_id: str, name: str, channel_type: str = "public"):
        self.channel_id = channel_id
        self.name = name
        self.type = channel_type  # public, private, dm
        self.members = set()
        self.messages = []
        self.threads = {}  # thread_id -> list of messages
        self.websockets = []  # Active WebSocket connections
    
    async def join(self, agent_id: str):
        """Add member to channel"""
        self.members.add(agent_id)
        await self.broadcast({
            "type": "system",
            "content": f"{agent_id} joined the channel"
        })
    
    async def post_message(self, message: AgentMessage) -> str:
        """Post message to channel"""
        self.messages.append(message)
        
        # If part of thread, add to thread
        if message.thread_id:
            if message.thread_id not in self.threads:
                self.threads[message.thread_id] = []
            self.threads[message.thread_id].append(message)
        
        # Route to mentioned agents
        for recipient in message.recipient_ids:
            if recipient.startswith("@"):
                agent_id = recipient[1:]
                await self._notify_agent(agent_id, message)
        
        # Broadcast to channel
        await self.broadcast(message.dict())
        
        return message.id
    
    async def broadcast(self, data: dict):
        """Broadcast to all connected clients"""
        disconnected = []
        for ws in self.websockets:
            try:
                await ws.send_json(data)
            except:
                disconnected.append(ws)
        
        # Clean up disconnected
        for ws in disconnected:
            self.websockets.remove(ws)
    
    async def _notify_agent(self, agent_id: str, message: AgentMessage):
        """Notify specific agent of mention"""
        # This would integrate with agent registry
        pass

class SlackForAgents:
    """
    Main service implementing "Slack for Agents" functionality.
    """
    
    def __init__(self):
        self.channels: Dict[str, AgentChannel] = {}
        self.agents: Dict[str, dict] = {}
        self.agent_handlers: Dict[str, callable] = {}
    
    def create_channel(self, name: str, channel_type: str = "public") -> AgentChannel:
        """Create new channel"""
        import uuid
        channel_id = str(uuid.uuid4())
        channel = AgentChannel(channel_id, name, channel_type)
        self.channels[channel_id] = channel
        return channel
    
    def register_agent(self, agent_id: str, agent_info: dict, handler: callable):
        """Register an agent that can receive messages"""
        self.agents[agent_id] = agent_info
        self.agent_handlers[agent_id] = handler
    
    async def send_message(
        self,
        channel_id: str,
        sender_id: str,
        content: str,
        mentions: List[str] = [],
        thread_id: Optional[str] = None,
        artifacts: List[Dict] = []
    ) -> str:
        """Send message to channel"""
        import uuid
        from datetime import datetime
        
        channel = self.channels.get(channel_id)
        if not channel:
            raise ValueError(f"Channel {channel_id} not found")
        
        message = AgentMessage(
            id=str(uuid.uuid4()),
            channel_id=channel_id,
            thread_id=thread_id,
            sender_id=sender_id,
            sender_type=self._get_sender_type(sender_id),
            recipient_ids=mentions,
            message_type=MessageType.TEXT,
            content=content,
            artifacts=artifacts,
            timestamp=datetime.utcnow().isoformat()
        )
        
        return await channel.post_message(message)
    
    async def invoke_agent(
        self,
        channel_id: str,
        invoker_id: str,
        agent_id: str,
        task: str,
        context: dict = None
    ) -> str:
        """
        Invoke an agent with a task.
        Creates a thread for the agent's work.
        """
        import uuid
        
        # Create thread for this task
        thread_id = str(uuid.uuid4())
        
        # Send task request message
        message = AgentMessage(
            id=str(uuid.uuid4()),
            channel_id=channel_id,
            thread_id=thread_id,
            sender_id=invoker_id,
            sender_type=self._get_sender_type(invoker_id),
            recipient_ids=[f"@{agent_id}"],
            message_type=MessageType.TASK_REQUEST,
            content=task,
            metadata={
                "task_type": "agent_invocation",
                "context": context or {}
            },
            timestamp=datetime.utcnow().isoformat()
        )
        
        await self.channels[channel_id].post_message(message)
        
        # Trigger agent handler
        if agent_id in self.agent_handlers:
            asyncio.create_task(
                self.agent_handlers[agent_id](message)
            )
        
        return thread_id
    
    def _get_sender_type(self, sender_id: str) -> str:
        """Determine if sender is human, agent, or system"""
        if sender_id == "system":
            return "system"
        if sender_id in self.agents:
            return "agent"
        return "human"

# Initialize service
slack_agents = SlackForAgents()

# API Endpoints
@app.post("/channels")
async def create_channel(name: str, channel_type: str = "public"):
    channel = slack_agents.create_channel(name, channel_type)
    return {"channel_id": channel.channel_id, "name": channel.name}

@app.post("/channels/{channel_id}/messages")
async def post_message(channel_id: str, sender_id: str, content: str, mentions: List[str] = []):
    message_id = await slack_agents.send_message(channel_id, sender_id, content, mentions)
    return {"message_id": message_id}

@app.post("/channels/{channel_id}/invoke")
async def invoke_agent(channel_id: str, invoker_id: str, agent_id: str, task: str):
    thread_id = await slack_agents.invoke_agent(channel_id, invoker_id, agent_id, task)
    return {"thread_id": thread_id}

@app.websocket("/channels/{channel_id}/ws")
async def websocket_endpoint(websocket: WebSocket, channel_id: str):
    await websocket.accept()
    
    if channel_id in slack_agents.channels:
        slack_agents.channels[channel_id].websockets.append(websocket)
        
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                # Handle incoming messages
        except:
            slack_agents.channels[channel_id].websockets.remove(websocket)
```

### 8.2 Agent Collaboration Example

```python
# example_collaboration.py
import asyncio
from slack_for_agents import SlackForAgents
from codex_integration import CodexIntegration
from claude_integration import ClaudeCodeIntegration

async def setup_collaboration():
    """Set up a collaborative workspace with Codex and Claude"""
    
    slack = SlackForAgents()
    
    # Create development channel
    dev_channel = slack.create_channel("dev-collaboration", "public")
    
    # Initialize agents
    codex = CodexIntegration(workspace_dir="./project")
    claude = ClaudeCodeIntegration(working_dir="./project")
    
    await codex.start()
    await claude.start_mcp_server()
    
    # Register agents with handlers
    async def codex_handler(message):
        """Handle tasks assigned to Codex"""
        if message.message_type == "TASK_REQUEST":
            task_content = message.content
            
            # Stream Codex responses
            async for update in codex.submit_task(task_content):
                # Post updates to the thread
                await slack.send_message(
                    channel_id=message.channel_id,
                    sender_id="codex-agent",
                    content=update.get("content", ""),
                    thread_id=message.thread_id
                )
    
    async def claude_handler(message):
        """Handle tasks assigned to Claude"""
        if message.message_type == "TASK_REQUEST":
            # Check if code review
            if "review" in message.content.lower():
                # Get code from artifacts
                code = message.artifacts[0].get("content", "") if message.artifacts else ""
                
                review = await claude.review_code(code)
                security = await claude.analyze_security(code)
                
                # Post review to thread
                await slack.send_message(
                    channel_id=message.channel_id,
                    sender_id="claude-agent",
                    content=f"**Code Review:**\n{review}\n\n**Security Analysis:**\n{json.dumps(security, indent=2)}",
                    thread_id=message.thread_id
                )
    
    slack.register_agent("codex", {"name": "Codex", "capabilities": ["coding"]}, codex_handler)
    slack.register_agent("claude", {"name": "Claude", "capabilities": ["review", "analysis"]}, claude_handler)
    
    # Join agents to channel
    await dev_channel.join("codex")
    await dev_channel.join("claude")
    
    return slack, dev_channel.channel_id

async def run_example():
    """Run example collaboration"""
    slack, channel_id = await setup_collaboration()
    
    # Human initiates task
    await slack.send_message(
        channel_id=channel_id,
        sender_id="human-user",
        content="@codex Create a user authentication module with login and signup",
        mentions=["@codex"]
    )
    
    # Codex generates code (simulated)
    generated_code = """
    def authenticate_user(username, password):
        # TODO: Implement secure authentication
        query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
        return db.query(query)
    """
    
    # Human asks Claude to review
    await slack.send_message(
        channel_id=channel_id,
        sender_id="human-user",
        content="@claude Please review this authentication code for security issues",
        mentions=["@claude"],
        artifacts=[{
            "filename": "auth.py",
            "content": generated_code,
            "language": "python"
        }]
    )
    
    # Claude finds issues and suggests fixes
    # Codex implements fixes
    # Collaboration continues...

if __name__ == "__main__":
    asyncio.run(run_example())
```

---

## 9. Security Considerations

### 9.1 Authentication & Authorization

| Layer | Mechanism | Implementation |
|-------|-----------|----------------|
| **Agent Identity** | mTLS + JWT | Each agent has X.509 certificate |
| **Capability Access** | RBAC | Role-based permission system |
| **Message Signing** | Ed25519 | All messages cryptographically signed |
| **Channel Access** | ACL | Channel-level access control lists |

### 9.2 Approval Flows

```
┌─────────────────────────────────────────────────────────────┐
│                    APPROVAL WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Agent requests action (e.g., file write, API call)          │
│              │                                               │
│              ▼                                               │
│  ┌─────────────────────┐                                     │
│  │  Policy Engine      │  Check against policy rules         │
│  │  - Auto-approve?    │  (e.g., safe file types)            │
│  │  - Human required?  │                                     │
│  └──────────┬──────────┘                                     │
│             │                                                │
│     ┌───────┴───────┐                                        │
│     ▼               ▼                                        │
│  [Auto-approve]  [Human Review]                              │
│     │               │                                        │
│     │          ┌────▼────┐                                   │
│     │          │ Web UI  │  Notify human                     │
│     │          │ / Slack │                                   │
│     │          └────┬────┘                                   │
│     │               │                                        │
│     └───────┬───────┘                                        │
│             ▼                                                │
│     [Execute / Deny]                                         │
│             │                                                │
│             ▼                                                │
│     Log to audit trail                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Sandboxing

| Agent | Sandbox Strategy |
|-------|-----------------|
| **Codex** | Container per session, filesystem restrictions |
| **Claude** | Process-level isolation, tool whitelisting |
| **Custom** | Kubernetes pods with network policies |

---

## 10. Deployment Architecture

### 10.1 Kubernetes Deployment

```yaml
# agent-platform-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: a2a-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: a2a-gateway
  template:
    metadata:
      labels:
        app: a2a-gateway
    spec:
      containers:
      - name: gateway
        image: agent-platform/a2a-gateway:latest
        ports:
        - containerPort: 8000
        env:
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: REDIS_URL
          value: "redis:6379"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-registry
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agent-registry
  template:
    metadata:
      labels:
        app: agent-registry
    spec:
      containers:
      - name: registry
        image: agent-platform/registry:latest
        ports:
        - containerPort: 8001
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: codex-agent-pool
spec:
  replicas: 5
  selector:
    matchLabels:
      app: codex-agent
  template:
    metadata:
      labels:
        app: codex-agent
    spec:
      containers:
      - name: codex
        image: agent-platform/codex-adapter:latest
        resources:
          limits:
            memory: "4Gi"
            cpu: "2000m"
        securityContext:
          runAsNonRoot: true
          readOnlyRootFilesystem: true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-agent-pool
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-agent
  template:
    metadata:
      labels:
        app: claude-agent
    spec:
      containers:
      - name: claude
        image: agent-platform/claude-adapter:latest
        resources:
          limits:
            memory: "8Gi"
            cpu: "4000m"
```

---

## 11. Roadmap

**Scope lock note (2026-02-15):**
- Active connector work in this roadmap is restricted to `codex` and `claude`.
- Non-Tier-1 platform connector work is backlog-only until the no-skip Phase 3 closeout succeeds.

### Phase 1: Foundation (Q1 2026)
- [ ] Implement A2A Gateway core
- [ ] Build Agent Registry with Agent Cards
- [ ] Codex CLI integration (JSON-RPC)
- [ ] Claude Code MCP integration
- [ ] Basic channel-based messaging

### Phase 2: Collaboration (Q2 2026)
- [ ] Thread-based conversations
- [ ] @mention routing
- [ ] Artifact sharing
- [ ] Approval workflows
- [ ] Slack connector

### Phase 3: Scale (Q3 2026)
- [ ] Horizontal scaling for agent pools
- [ ] Advanced orchestration patterns
- [ ] Memory persistence
- [ ] Multi-tenant support
- [ ] Enterprise SSO

### Phase 4: Intelligence (Q4 2026)
- [ ] Self-organizing agent teams
- [ ] Dynamic capability discovery
- [ ] Learning from interactions
- [ ] Predictive task routing

---

## 12. Appendix

### 12.1 Reference Implementations

| Component | Language | Framework | Status |
|-----------|----------|-----------|--------|
| A2A Gateway | Python | FastAPI | Planned |
| Agent Registry | Python | FastAPI + PostgreSQL | Planned |
| Message Bus | Go | Kafka client | Planned |
| Codex Adapter | Python | Subprocess | Planned |
| Claude Adapter | Python | MCP SDK | Planned |
| Web UI | TypeScript | React | Planned |

### 12.2 Related Standards

- **A2A Protocol**: https://github.com/google/A2A
- **MCP Specification**: https://modelcontextprotocol.io/
- **AGP (Agent Gateway Protocol)**: https://agp.io/
- **ACP (Agent Communication Protocol)**: IBM/LF project

### 12.3 Glossary

| Term | Definition |
|------|------------|
| **A2A** | Agent-to-Agent Protocol for inter-agent communication |
| **MCP** | Model Context Protocol for agent-tool integration |
| **Agent Card** | JSON manifest describing agent capabilities |
| **Task** | Unit of work in A2A with lifecycle states |
| **Thread** | Conversation context between agents |
| **Artifact** | File or data passed between agents |

---

*End of Document*
