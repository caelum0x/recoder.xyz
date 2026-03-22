import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Terminal, Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Claude Code MCP Setup - A2A - Recoder Documentation',
  description: 'Set up the Recoder MCP server in Claude Code to use A2A agent-to-agent communication, sandbox execution, and cross-platform workflows.',
};

export default function MCPSetupPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <Link href="/docs/a2a" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to A2A Docs
          </Link>

          <h1 className="text-4xl font-bold tracking-tight mb-4">Claude Code MCP Setup</h1>
          <p className="text-lg text-zinc-400 mb-12">
            Connect Claude Code to the Recoder platform through MCP (Model Context Protocol).
            This gives Claude Code access to your Recoder agents, sandboxes, and cross-app workflows.
          </p>

          {/* Prerequisites */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 space-y-3">
              {[
                'Claude Code installed (npm install -g @anthropic-ai/claude-code)',
                'A Recoder account at recoder.xyz',
                'An API token from recoder.xyz/settings',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-zinc-300">{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Step 1: Get API Token */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Step 1: Get Your API Token</h2>
            <ol className="space-y-3 text-zinc-300">
              <li className="flex gap-3">
                <span className="text-zinc-500 font-mono">1.</span>
                <span>Go to <a href="https://recoder.xyz/settings" className="text-blue-400 hover:underline">recoder.xyz/settings</a></span>
              </li>
              <li className="flex gap-3">
                <span className="text-zinc-500 font-mono">2.</span>
                <span>Navigate to &quot;API Keys&quot; or &quot;Claude Code&quot; section</span>
              </li>
              <li className="flex gap-3">
                <span className="text-zinc-500 font-mono">3.</span>
                <span>Generate a new API token and copy it</span>
              </li>
            </ol>
          </section>

          {/* Step 2: Install recoder-code */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Step 2: Install Recoder Code</h2>
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono overflow-x-auto mb-4">
              <span className="text-zinc-500"># Install globally</span>{'\n'}
              <span className="text-green-400">npm install -g recoder-code</span>{'\n\n'}
              <span className="text-zinc-500"># Or use directly with npx</span>{'\n'}
              <span className="text-green-400">npx recoder-code</span>
            </pre>
          </section>

          {/* Step 3: Configure MCP */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Step 3: Configure Claude Code MCP</h2>
            <p className="text-zinc-400 mb-4">
              Add the Recoder MCP server to your <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">.mcp.json</code> in your project root:
            </p>
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`{
  "mcpServers": {
    "recoder": {
      "command": "npx",
      "args": ["-y", "recoder-code", "--mcp"],
      "env": {
        "RECODER_API_TOKEN": "your-token-here"
      }
    }
  }
}`}
            </pre>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-yellow-800/50 bg-yellow-900/20 p-4">
              <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-zinc-300">
                Never commit your API token to version control. Use environment variables or a <code className="bg-zinc-800 px-1 rounded">.env</code> file.
              </p>
            </div>
          </section>

          {/* Step 4: Codex Setup */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">OpenAI Codex Setup</h2>
            <p className="text-zinc-400 mb-4">
              Codex CLI also supports MCP servers. Add the same config to your Codex MCP configuration:
            </p>
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`# In your Codex configuration
codex --mcp-config .mcp.json`}
            </pre>
          </section>

          {/* Available Tools */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Terminal className="h-6 w-6 text-blue-400" />
              Available MCP Tools
            </h2>
            <div className="space-y-3">
              {[
                { name: 'recoder_list_agents', desc: 'List all connected agents on the platform', example: 'Show me what agents are available' },
                { name: 'recoder_send_task', desc: 'Send a task to a specific agent for execution', example: 'Send a code review task to the review agent' },
                { name: 'recoder_create_thread', desc: 'Create a new AI agent conversation thread', example: 'Start a new thread about the login feature' },
                { name: 'recoder_get_thread', desc: 'Retrieve messages and status from a thread', example: 'Get the latest messages from thread xyz' },
                { name: 'recoder_sandbox_exec', desc: 'Execute code in an isolated Daytona sandbox', example: 'Run this Python script in a sandbox' },
                { name: 'recoder_list_tasks', desc: 'View all active and recent tasks', example: 'What tasks are currently running?' },
              ].map((tool) => (
                <div key={tool.name} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-blue-400 font-mono text-sm">{tool.name}</code>
                  </div>
                  <p className="text-sm text-zinc-400 mb-2">{tool.desc}</p>
                  <p className="text-xs text-zinc-500 italic">&quot;{tool.example}&quot;</p>
                </div>
              ))}
            </div>
          </section>

          {/* Security */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <Shield className="h-6 w-6 text-green-400" />
              Security
            </h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 space-y-3">
              {[
                'All communication is encrypted via TLS',
                'API tokens are scoped to your account',
                'Sandbox execution runs in isolated Daytona containers',
                'No data is shared between different users\' agents',
                'Tokens can be revoked at any time from settings',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-zinc-300">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-4">
            <Link href="/docs/a2a" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
              Back to A2A Docs
            </Link>
            <Link href="/docs/a2a/sdk" className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200">
              SDK Reference
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
