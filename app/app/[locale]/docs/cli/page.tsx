import Link from 'next/link';
import { Terminal, ArrowRight, Download } from 'lucide-react';

export default function CLIDocsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-neutral-800 border border-neutral-700 rounded-xl flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold">Agent CLIs</h1>
          </div>
          <p className="text-xl text-gray-400">
            Recoder does not ship its own coding CLI — the desktop app runs the
            agent CLIs you already use, in parallel isolated git worktrees.
          </p>
        </div>

        <div className="space-y-12">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Get the Desktop App</h2>
            <p className="text-gray-300 mb-4">
              Recoder is a desktop workspace for macOS, Windows, and Linux. It is
              local-first: your code and your keys stay on your machine.
            </p>
            <a
              href="/download"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Download Recoder</span>
            </a>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Install the Agents You Want to Run</h2>
            <p className="text-gray-300 mb-4">
              Install any terminal coding agents — Recoder orchestrates them with
              your own API keys (BYOK):
            </p>
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Claude Code</div>
                <div className="text-green-400">npm install -g @anthropic-ai/claude-code</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Codex</div>
                <div className="text-green-400">npm install -g @openai/codex</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># opencode</div>
                <div className="text-green-400">npm install -g opencode-ai</div>
              </div>
            </div>
            <p className="text-gray-400 text-sm mt-4">
              Cursor CLI, pi, and other terminal agents work too — if it runs in
              a terminal, Recoder can run it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Run in Parallel, Review, Merge</h2>
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-4 font-medium">Step</th>
                    <th className="text-left p-4 font-medium">What happens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr><td className="p-4 font-mono text-white">Launch</td><td className="p-4 text-gray-300">Describe the task once; run it on multiple agents at once, each in its own isolated git worktree</td></tr>
                  <tr><td className="p-4 font-mono text-white">Watch</td><td className="p-4 text-gray-300">Each run streams live in its own terminal — pause, steer, or stop any of them</td></tr>
                  <tr><td className="p-4 font-mono text-white">Compare</td><td className="p-4 text-gray-300">Review the divergent diffs side by side when the runs finish</td></tr>
                  <tr><td className="p-4 font-mono text-white">Merge</td><td className="p-4 text-gray-300">Merge the best attempt into your branch and discard the rest</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex space-x-4">
            <a
              href="/download"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Download the App</span>
            </a>
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center space-x-2 px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
            >
              <span>Getting Started Guide</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
