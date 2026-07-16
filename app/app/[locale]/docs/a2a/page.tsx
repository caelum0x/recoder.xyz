import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Terminal, Network, Zap, ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'A2A (Agent-to-Agent) - Recoder Documentation',
  description: 'Connect AI tools through the Recoder A2A protocol.',
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
            Connect AI tools through the Recoder A2A protocol. Claude Code, Codex, and custom agents can collaborate through a unified task system.
          </p>

          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Quick Start</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Terminal className="h-5 w-5 text-blue-400" />
                1. Install
              </h3>
              <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto">{"npm install -g recoder-code\n\n# Or use directly with npx:\nnpx recoder-a2a"}</pre>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
              <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                2. Available Tools
              </h3>
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

          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Architecture</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { from: 'Claude Code', to: 'Recoder Agents', desc: 'Dispatch tasks via MCP' },
                  { from: 'Agents', to: 'PM', desc: 'Create tasks from conversations' },
                  { from: 'PM', to: 'Agency', desc: 'Generate deliverables from specs' },
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
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <Network className="h-6 w-6 text-green-400" />
              Endpoints
            </h2>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left py-3 px-4 font-medium">Endpoint</th>
                    <th className="text-left py-3 px-4 font-medium">Protocol</th>
                    <th className="text-left py-3 px-4 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {[
                    { ep: 'wss://docker.recoder.xyz/agent-bridge', proto: 'WebSocket', purpose: 'Real-time agent bridge' },
                    { ep: 'https://api.recoder.xyz/v1/threads', proto: 'REST', purpose: 'Thread management' },
                    { ep: 'https://api.recoder.xyz/v1/agents', proto: 'REST', purpose: 'Agent registry' },
                    { ep: 'https://docker.recoder.xyz/api/a2a/*', proto: 'REST + SSE', purpose: 'A2A task lifecycle' },
                  ].map((r) => (
                    <tr key={r.ep}>
                      <td className="py-3 px-4 font-mono text-xs text-blue-400">{r.ep}</td>
                      <td className="py-3 px-4">{r.proto}</td>
                      <td className="py-3 px-4 text-zinc-400">{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-4">
            <Link href="/docs" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">
              Back to Docs
            </Link>
            <Link href="/docs/a2a/mcp-setup" className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200">
              MCP Setup Guide
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
