import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Terminal, Code2, Network, Zap, MessageSquare, ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'A2A (Agent-to-Agent) - Recoder Documentation',
  description: 'Connect AI tools through the Recoder A2A protocol. Use Claude Code, Codex, and custom agents to collaborate through a unified task system.',
};

export default function A2ADocsPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <Link href="/docs" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to Documentation
          </Link>

          <h1 className="text-4xl font-bold tracking-tight mb-4">A2A (Agent-to-Agent)</h1>
          <p className="text-lg text-zinc-400 mb-12">
            Let different AI tools talk to each other through Recoder. Your Claude Code session can dispatch tasks to Recoder agents,
            trigger workflows, and get results back.
          </p>

          {/* Quick Start */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Quick Start</h2>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Terminal className="h-5 w-5 text-blue-400" />
                1. Install the MCP Server
              </h3>
              <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`npm install -g recoder-code

# Or use directly with npx:
npx recoder-a2a-sdk`}
              </pre>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-purple-400" />
                2. Configure Claude Code
              </h3>
              <p className="text-zinc-400 mb-3">Add to your <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">.mcp.json</code>:</p>
              <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`{
  "mcpServers": {
    "recoder": {
      "command": "node",
      "args": ["node_modules/recoder-code/mcp/recoder-a2a-server.js"],
      "env": {
        "RECODER_API_TOKEN": "your-token-from-recoder.xyz/settings"
      }
    }
  }
}`}
              </pre>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                3. Start Using
              </h3>
              <p className="text-zinc-400 mb-3">In Claude Code, you now have 6 tools:</p>
              <div className="grid gap-2">
                {[
                  { name: 'recoder_list_agents', desc: 'See all connected agents' },
                  { name: 'recoder_send_task', desc: 'Send a task to another agent' },
                  { name: 'recoder_create_thread', desc: 'Start an AI agent thread' },
                  { name: 'recoder_get_thread', desc: 'Get messages from a thread' },
                  { name: 'recoder_sandbox_exec', desc: 'Run code in an isolated sandbox' },
                  { name: 'recoder_list_tasks', desc: 'View active tasks' },
                ].map((tool) => (
                  <div key={tool.name} className="flex items-center gap-3 rounded bg-zinc-800/50 px-3 py-2">
                    <code className="text-sm text-blue-400 font-mono">{tool.name}</code>
                    <span className="text-sm text-zinc-500">{tool.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Architecture */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">How It Works</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <pre className="text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre">
{`Claude Code / Codex         Custom Agents
      |                         |
      | MCP (stdio)             | HTTP / WebSocket
      v                         v
+------------------------------------------+
|       docker.recoder.xyz (:3100)         |
|                                          |
|  Agent Bridge (WS)  |  Task Lifecycle    |
|  Intent Router      |  Workflow Engine   |
|  Agent Registry     |  Audit Trail       |
+----------+--------------+---------------+
           |              |
     +-----+-----+
     | Python    |
     | Backend   |
     | (Agents)  |
     +-----------+
              </pre>
            </div>
          </section>

          {/* Cross-App Workflows */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <Network className="h-6 w-6 text-green-400" />
              Cross-App Workflows
            </h2>
            <p className="text-zinc-400 mb-6">
              A2A workflows connect all Recoder platforms. An AI agent conversation can create PM tasks.
              A PM project can trigger agency deliverables. Everything flows through the A2A protocol.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { from: 'Agents', to: 'PM', desc: 'Create tasks from AI conversations', color: 'blue' },
                { from: 'PM', to: 'Agency', desc: 'Generate deliverables from specs', color: 'purple' },
                { from: 'Agency', to: 'Agents', desc: 'AI review of deliverables', color: 'green' },
              ].map((wf) => (
                <div key={wf.from + wf.to} className="rounded-lg border border-zinc-800 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{wf.from}</span>
                    <ArrowRight className="h-4 w-4 text-zinc-500" />
                    <span className="font-medium">{wf.to}</span>
                  </div>
                  <p className="text-sm text-zinc-400">{wf.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* SDK */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">SDK</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto mb-4">
{`npm install recoder-a2a-sdk`}
              </pre>
              <p className="text-zinc-400 mb-3">5 modules for building custom A2A integrations:</p>
              <div className="grid gap-2">
                {[
                  { mod: 'state-mapping', desc: 'Translate between connector and canonical task states' },
                  { mod: 'error-mapping', desc: 'Normalize errors across platforms' },
                  { mod: 'envelope-builders', desc: 'Create pre-configured task envelopes' },
                  { mod: 'audit-helpers', desc: 'Emit typed audit events' },
                  { mod: 'validation', desc: 'Validate schemas at API boundaries' },
                ].map((m) => (
                  <div key={m.mod} className="flex items-start gap-3 rounded bg-zinc-800/50 px-3 py-2">
                    <code className="text-sm text-purple-400 font-mono whitespace-nowrap">@recoder/a2a-sdk/{m.mod}</code>
                    <span className="text-sm text-zinc-500">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Social Channels */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-orange-400" />
              Social Channel Integration
            </h2>
            <p className="text-zinc-400 mb-4">
              Recoder Agency connects WhatsApp, Telegram, Teams, and more to the Recoder platform.
              Messages from social channels are automatically routed to PM or Agency based on content.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {['WhatsApp', 'Telegram', 'Discord', 'Teams', 'Slack', 'Signal'].map((ch) => (
                <div key={ch} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-4 py-3">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>{ch}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Supported Platforms */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Supported AI Platforms</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-3 text-left font-medium text-zinc-400">Platform</th>
                    <th className="pb-3 text-left font-medium text-zinc-400">Status</th>
                    <th className="pb-3 text-left font-medium text-zinc-400">Integration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {[
                    { name: 'Claude Code', status: 'Production', type: 'MCP + WebSocket' },
                    { name: 'OpenAI Codex', status: 'Production', type: 'MCP adapter' },
                    { name: 'Cursor', status: 'RFC', type: 'REST connector' },
                    { name: 'Windsurf', status: 'RFC', type: 'REST connector' },
                    { name: 'Replit', status: 'RFC', type: 'REST connector' },
                    { name: 'Custom', status: 'Production', type: 'REST / WebSocket' },
                  ].map((p) => (
                    <tr key={p.name}>
                      <td className="py-3 font-medium">{p.name}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                          p.status === 'Production' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-400">{p.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-4">
            <Link href="/docs" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
              Back to Docs
            </Link>
            <a
              href="https://github.com/ArhansGit/recoder.xyz/blob/main/docs/user-guide/a2a-guide.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200"
            >
              Full A2A Reference
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
