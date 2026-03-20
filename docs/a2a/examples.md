# A2A Usage Examples

Real-world examples showing how to use the Recoder A2A tools from Claude Code, Codex, or Cursor.

---

## Example 1: Create a Thread and Ask an Agent to Build a REST API

This example creates a new thread on the Recoder platform and tasks an AI agent with building a REST API.

**You say to Claude Code:**
> Create a thread on Recoder and ask the agent to build a REST API for managing bookmarks with CRUD operations.

**Claude Code calls `recoder_create_thread`:**
```json
{
  "prompt": "Build a REST API for managing bookmarks with full CRUD operations. Use Express.js with TypeScript. Include input validation, error handling, and pagination on the list endpoint."
}
```

**Response:**
```
Thread: thr_8f2a3b4c5d6e
Status: running
Run: run_a1b2c3d4
View: https://agents.recoder.xyz/thread/thr_8f2a3b4c5d6e
```

**Then check progress with `recoder_get_thread`:**
```json
{
  "thread_id": "thr_8f2a3b4c5d6e"
}
```

**Response:**
```
[user] Build a REST API for managing bookmarks with full CRUD operations. Use Express.js with TypeScript. Include input validation, error handling, and pagination on the list endpoint.

[assistant] I'll create a bookmark REST API with Express.js and TypeScript. Let me set up the project structure:

1. Setting up package.json with dependencies
2. Creating the Bookmark model with Zod validation
3. Implementing CRUD routes: GET /bookmarks, GET /bookmarks/:id, POST /bookmarks, PUT /bookmarks/:id, DELETE /bookmarks/:id
4. Adding pagination to the list endpoint
5. Adding global error handling middleware

Here's the implementation...
```

---

## Example 2: Execute Python Code in a Sandbox

Run Python code safely in an isolated Daytona sandbox without affecting your local machine.

**You say to Claude Code:**
> Run a quick Python script that fetches the top 5 Hacker News stories.

**Claude Code calls `recoder_sandbox_exec`:**
```json
{
  "command": "python3 -c \"\nimport urllib.request, json\ndata = json.loads(urllib.request.urlopen('https://hacker-news.firebaseio.com/v0/topstories.json').read())\nfor story_id in data[:5]:\n    story = json.loads(urllib.request.urlopen(f'https://hacker-news.firebaseio.com/v0/item/{story_id}.json').read())\n    print(f\\\"- {story['title']} ({story.get('score', 0)} pts)\\\")\n\""
}
```

**Response:**
```
Sandbox: sb_7e8f9a0b (auto-created)
Exit: 0

- Show HN: I built a tool to visualize Git repos (342 pts)
- The future of programming languages (289 pts)
- SQLite as a production database in 2026 (256 pts)
- Why we moved from Kubernetes to bare metal (234 pts)
- A deep dive into Linux memory management (198 pts)
```

### Reusing a Sandbox

If you need to run multiple commands in the same environment, save the sandbox ID and reuse it:

**First command -- install dependencies:**
```json
{
  "command": "pip install pandas numpy && echo 'Dependencies installed'"
}
```

**Response:**
```
Sandbox: sb_c3d4e5f6 (auto-created)
Exit: 0

Successfully installed pandas-2.2.0 numpy-1.26.4
Dependencies installed
```

**Second command -- use the same sandbox:**
```json
{
  "command": "python3 -c \"import pandas as pd; df = pd.DataFrame({'x': range(10), 'y': [i**2 for i in range(10)]}); print(df.describe())\"",
  "sandbox_id": "sb_c3d4e5f6"
}
```

**Response:**
```
Sandbox: sb_c3d4e5f6
Exit: 0

              x          y
count  10.000000  10.000000
mean    4.500000  28.500000
std     3.027650  27.688746
min     0.000000   0.000000
25%     2.250000   6.250000
50%     4.500000  20.500000
75%     6.750000  42.250000
max     9.000000  81.000000
```

---

## Example 3: List All Agents and Their Capabilities

**You say to Claude Code:**
> Show me what agents are available on the Recoder A2A network.

**Claude Code calls `recoder_list_agents`:**
```json
{}
```

**Response:**
```
- codex (codex) -- [disabled] health:unknown
- claude_code (claude_code) -- [enabled] health:healthy
- recoder_web (recoder_web) -- [enabled] health:healthy
- recoder_agency (recoder_agency) -- [enabled] health:healthy
- recoder_pm (recoder_pm) -- [enabled] health:healthy
- recoder_backend (recoder_backend) -- [enabled] health:healthy

A2A bridge: connected
```

---

## Example 4: Send a Task to the Research Agent

Delegate work to another agent on the platform.

**You say to Claude Code:**
> Ask the backend agent to analyze our database schema and suggest performance optimizations.

**Claude Code calls `recoder_send_task`:**
```json
{
  "target_agent": "recoder_backend",
  "task": "Analyze the current PostgreSQL database schema for the recoder_main database. Identify missing indexes, N+1 query patterns, and suggest specific performance optimizations. Focus on the user, session, and thread tables.",
  "intent": "execute"
}
```

**Response:**
```
Task sent to recoder_backend via A2A bridge (real-time).
Intent: execute
Task: Analyze the current PostgreSQL database schema for the recoder_main database. Identify missing indexes, N+1 query patterns, and suggest specific performance optimizations. Focus on the user, session, and thread tables.
```

**Then check task status with `recoder_list_tasks`:**
```json
{}
```

**Response:**
```
- task_m2x7k001 state:working from:claude_code to:recoder_backend
```

---

## Example 5: Plan Before Executing

Use the `plan` intent to get a proposed approach before committing to execution.

**You say to Claude Code:**
> Ask the PM agent to plan a migration from REST to GraphQL for our user API.

**Claude Code calls `recoder_send_task`:**
```json
{
  "target_agent": "recoder_pm",
  "task": "Create a migration plan for converting the user management REST API to GraphQL. Include phases, estimated effort for each phase, risk assessment, and a rollback strategy. Don't execute anything, just plan.",
  "intent": "plan"
}
```

**Response:**
```
Task sent to recoder_pm via A2A bridge (real-time).
Intent: plan
Task: Create a migration plan for converting the user management REST API to GraphQL...
```

---

## Example 6: Multi-Step Workflow -- Build, Test, Deploy

Chain multiple A2A tools together for a complete workflow.

**Step 1: Create a thread for the project:**
```json
// recoder_create_thread
{
  "prompt": "Set up a new microservice for email notifications. Use Node.js with TypeScript, include a queue (BullMQ), and write unit tests."
}
```

**Step 2: While the agent works, run a test script in a sandbox:**
```json
// recoder_sandbox_exec
{
  "command": "node -e \"const http = require('http'); http.get('https://api.recoder.xyz/v1/health', (res) => { let d=''; res.on('data', c => d+=c); res.on('end', () => console.log('API health:', d)); });\""
}
```

**Step 3: Check the thread result:**
```json
// recoder_get_thread
{
  "thread_id": "thr_8f2a3b4c5d6e"
}
```

**Step 4: Hand off deployment to the backend agent:**
```json
// recoder_send_task
{
  "target_agent": "recoder_backend",
  "task": "Deploy the email notification microservice from thread thr_8f2a3b4c5d6e to the staging environment. Run the test suite first.",
  "intent": "handoff"
}
```

---

## Example 7: Quick Computations in a Sandbox

Use the sandbox for quick calculations or data processing without leaving your conversation.

**You say to Claude Code:**
> Calculate the compound interest on $10,000 at 7% annual return over 30 years.

**Claude Code calls `recoder_sandbox_exec`:**
```json
{
  "command": "python3 -c \"principal=10000; rate=0.07; years=30; final=principal*(1+rate)**years; print(f'Initial: ${principal:,.2f}'); print(f'Final: ${final:,.2f}'); print(f'Growth: {final/principal:.1f}x')\""
}
```

**Response:**
```
Sandbox: sb_f1e2d3c4 (auto-created)
Exit: 0

Initial: $10,000.00
Final: $76,122.55
Growth: 7.6x
```

---

## Example 8: Run Tests in Isolation

Execute your project's test suite in a clean sandbox environment.

**Claude Code calls `recoder_sandbox_exec`:**
```json
{
  "command": "cd /tmp && git clone https://github.com/your-org/your-repo.git && cd your-repo && npm install && npm test 2>&1 | tail -20"
}
```

**Response:**
```
Sandbox: sb_a9b8c7d6 (auto-created)
Exit: 0

  User API
    GET /users
      [pass] should return list of users (23ms)
      [pass] should support pagination (15ms)
    POST /users
      [pass] should create a new user (31ms)
      [pass] should validate required fields (8ms)

  4 passing (77ms)
  0 failing
```

---

## Tips

1. **Sandbox reuse**: If you are running multiple related commands, save the `sandbox_id` from the first execution and pass it to subsequent calls. This avoids sandbox creation overhead and preserves installed packages.

2. **Intent selection**: Use `plan` when you want an analysis or proposal. Use `execute` when you want the agent to do the work. Use `handoff` to transfer full ownership of a task.

3. **Thread monitoring**: After creating a thread, wait a few seconds before calling `recoder_get_thread` -- the agent needs time to process the prompt and generate a response.

4. **Agent availability**: Call `recoder_list_agents` first to verify the target agent is online and healthy before sending tasks.

5. **Error handling**: If `recoder_sandbox_exec` returns "Error: DAYTONA_API_KEY not configured", add the `DAYTONA_API_KEY` environment variable to your `.mcp.json` configuration.
