import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Network, MessageSquare, Briefcase, LayoutDashboard, Code2, Bot } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Cross-App Workflows - A2A - Recoder Documentation',
  description: 'Build workflows that span Recoder Agents, PM, Agency, and social channels through the A2A protocol.',
};

export default function WorkflowsPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <Link href="/docs/a2a" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to A2A Docs
          </Link>

          <h1 className="text-4xl font-bold tracking-tight mb-4">Cross-App Workflows</h1>
          <p className="text-lg text-zinc-400 mb-12">
            A2A workflows connect all Recoder surfaces. AI agent conversations create PM tasks,
            PM projects trigger agency deliverables, social channel messages route to the right platform.
          </p>

          {/* Architecture */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Platform Architecture</h2>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <pre className="text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre">
{`                     Social Channels
                  (WhatsApp, Telegram, etc.)
                           |
                    Agency Gateway
                           |
               +--- keyword routing ---+
               |           |           |
          recoder_pm  recoder_agency  recoder_backend
               |           |           |
         +-----+-----------+-----------+------+
         |         docker.recoder.xyz          |
         |         A2A Task Router             |
         +-----+-------+-------+------+-------+
               |       |       |      |
          Agents    PM     Agency   Web IDE
    agents.xyz  pm.xyz  agency.xyz  web.xyz`}
              </pre>
            </div>
          </section>

          {/* Workflow Examples */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6">Workflow Examples</h2>
            <div className="space-y-8">

              {/* Workflow 1: Claude Code -> Agents -> PM */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-blue-400" />
                  Code Review to PM Task
                </h3>
                <p className="text-zinc-400 mb-4">
                  Claude Code reviews a PR, finds issues, and automatically creates PM tasks for each finding.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { label: 'Claude Code', color: 'bg-blue-900/50 text-blue-400 border-blue-800' },
                    { label: 'Recoder Agent', color: 'bg-purple-900/50 text-purple-400 border-purple-800' },
                    { label: 'PM Task', color: 'bg-green-900/50 text-green-400 border-green-800' },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${step.color}`}>{step.label}</span>
                      {i < 2 && <ArrowRight className="h-4 w-4 text-zinc-600" />}
                    </div>
                  ))}
                </div>
                <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto mt-4">
{`// In Claude Code (via MCP)
recoder_send_task({
  agent: "code-reviewer",
  task: "Review PR #42 for security issues",
  callback: "create_pm_tasks"  // auto-create PM tasks from findings
})`}
                </pre>
              </div>

              {/* Workflow 2: Social -> PM/Agency */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-orange-400" />
                  Social Channel to PM/Agency
                </h3>
                <p className="text-zinc-400 mb-4">
                  Messages from WhatsApp or Telegram are automatically routed based on keywords.
                  Project-related messages go to PM, client-related messages go to Agency.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  <div className="rounded bg-zinc-800/50 p-3">
                    <p className="text-sm font-medium text-zinc-300 mb-1">PM Keywords</p>
                    <p className="text-xs text-zinc-500">project, task, sprint, feature, milestone, backlog, epic, story, roadmap, ticket</p>
                  </div>
                  <div className="rounded bg-zinc-800/50 p-3">
                    <p className="text-sm font-medium text-zinc-300 mb-1">Agency Keywords</p>
                    <p className="text-xs text-zinc-500">client, deliverable, quote, invoice, proposal, brief, contract, billing, scope</p>
                  </div>
                </div>
              </div>

              {/* Workflow 3: Agency -> Agents */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-purple-400" />
                  Agency Deliverable Review
                </h3>
                <p className="text-zinc-400 mb-4">
                  Agency creates a deliverable, then dispatches it to an AI agent for automated review and quality check.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { label: 'Agency', color: 'bg-purple-900/50 text-purple-400 border-purple-800' },
                    { label: 'Review Agent', color: 'bg-blue-900/50 text-blue-400 border-blue-800' },
                    { label: 'Report', color: 'bg-green-900/50 text-green-400 border-green-800' },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${step.color}`}>{step.label}</span>
                      {i < 2 && <ArrowRight className="h-4 w-4 text-zinc-600" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Workflow 4: Sandbox Execution */}
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-yellow-400" />
                  Sandbox Code Execution
                </h3>
                <p className="text-zinc-400 mb-4">
                  Any A2A-connected tool can execute code in an isolated Daytona sandbox. Results return through the task envelope.
                </p>
                <pre className="bg-black rounded-md p-4 text-sm font-mono text-green-400 overflow-x-auto mt-4">
{`// Execute code in a sandbox from Claude Code
recoder_sandbox_exec({
  language: "python",
  code: "import pandas as pd; df = pd.read_csv('data.csv'); print(df.describe())",
  timeout: 30000
})
// => { stdout: "...", exitCode: 0, executionTime: 1234 }`}
                </pre>
              </div>
            </div>
          </section>

          {/* Task Lifecycle */}
          <section className="mb-16">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-green-400" />
              Task Lifecycle
            </h2>
            <p className="text-zinc-400 mb-4">
              Every A2A task follows a canonical state machine. Connectors map their native states to this model.
            </p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <pre className="text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre">
{`SUBMITTED ──> ACCEPTED ──> IN_PROGRESS ──> COMPLETED
                  |              |
                  |              +──> INPUT_REQUIRED ──> IN_PROGRESS
                  |              |
                  +──> FAILED    +──> FAILED
                  |
                  +──> CANCELLED`}
              </pre>
            </div>
            <div className="grid gap-2 mt-4 sm:grid-cols-2">
              {[
                { state: 'SUBMITTED', desc: 'Task created by source agent' },
                { state: 'ACCEPTED', desc: 'Target agent acknowledged receipt' },
                { state: 'IN_PROGRESS', desc: 'Agent is actively working' },
                { state: 'INPUT_REQUIRED', desc: 'Agent needs more information' },
                { state: 'COMPLETED', desc: 'Task finished successfully' },
                { state: 'FAILED', desc: 'Task encountered an error' },
                { state: 'CANCELLED', desc: 'Task was cancelled by user or system' },
              ].map((s) => (
                <div key={s.state} className="flex items-start gap-2 rounded bg-zinc-800/50 px-3 py-2">
                  <code className="text-xs text-yellow-400 font-mono whitespace-nowrap">{s.state}</code>
                  <span className="text-xs text-zinc-500">{s.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Building Custom Workflows */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Building Custom Workflows</h2>
            <p className="text-zinc-400 mb-4">
              Use the A2A SDK to build custom integrations that connect to the Recoder task system.
            </p>
            <pre className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-green-400 overflow-x-auto">
{`import {
  buildCodexEnvelope,
  startEnvelope,
  completeEnvelope,
  emitTaskSubmitted,
  validateTaskEnvelope,
} from '@recoder/a2a-sdk';

// 1. Create task envelope
const envelope = buildCodexEnvelope({
  sourceAgent: { id: 'my-workflow', platform: 'custom' },
  targetAgent: { id: 'recoder-agent-1', platform: 'recoder' },
  payload: { type: 'text', content: 'Analyze sales Q4 data' },
  workspaceId: 'ws_prod',
});

// 2. Validate before sending
const { valid, issues } = validateTaskEnvelope(envelope);
if (!valid) throw new Error(issues.map(i => i.message).join(', '));

// 3. Submit to Recoder
const res = await fetch('https://api.recoder.xyz/v1/a2a/tasks', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(envelope),
});

// 4. Track progress
const task = await res.json();
console.log(task.id, task.state); // "task_xxx", "SUBMITTED"`}
            </pre>
          </section>

          <div className="flex gap-4">
            <Link href="/docs/a2a/sdk" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800">
              SDK Reference
            </Link>
            <Link href="/docs/a2a" className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200">
              A2A Overview
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
