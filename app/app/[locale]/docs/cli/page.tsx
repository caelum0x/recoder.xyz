import Link from 'next/link';
import { Terminal, ArrowRight, Copy, Download } from 'lucide-react';

export default function CLIDocsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold">CLI Documentation</h1>
          </div>
          <p className="text-xl text-gray-400">
            Terminal-based AI development tool for your local environment.
          </p>
        </div>

        <div className="space-y-12">
          <section>
            <h2 className="text-2xl font-bold mb-4">Installation</h2>
            <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
              <div className="text-gray-400 mb-2"># Install globally via npm</div>
              <div className="text-green-400">npm install -g @recoder/cli</div>
              <div className="text-gray-400 mt-4 mb-2"># Or using pnpm</div>
              <div className="text-green-400">pnpm add -g @recoder/cli</div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-gray-300 mb-4">
              Login to sync your API keys and settings from recoder.xyz:
            </p>
            <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
              <div className="text-green-400">recoder login</div>
              <div className="text-gray-500 mt-2"># Opens browser for authentication</div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Basic Usage</h2>
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Start interactive chat</div>
                <div className="text-green-400">recoder</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Generate code with a prompt</div>
                <div className="text-green-400">recoder "create a REST API with Express"</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Generate in current directory</div>
                <div className="text-green-400">recoder "add authentication to this project"</div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Commands</h2>
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left p-4 font-medium">Command</th>
                    <th className="text-left p-4 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr><td className="p-4 font-mono text-orange-400">recoder</td><td className="p-4 text-gray-300">Start interactive mode</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder "prompt"</td><td className="p-4 text-gray-300">Generate code from prompt</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder login</td><td className="p-4 text-gray-300">Authenticate with recoder.xyz</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder logout</td><td className="p-4 text-gray-300">Sign out</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder config</td><td className="p-4 text-gray-300">View/edit configuration</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder models</td><td className="p-4 text-gray-300">List available AI models</td></tr>
                  <tr><td className="p-4 font-mono text-orange-400">recoder --help</td><td className="p-4 text-gray-300">Show help</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Configuration</h2>
            <p className="text-gray-300 mb-4">
              Configure your preferred AI model and settings:
            </p>
            <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
              <div className="text-gray-400 mb-2"># Set default model</div>
              <div className="text-green-400">recoder config set model claude-3-5-sonnet</div>
              <div className="text-gray-400 mt-4 mb-2"># View current config</div>
              <div className="text-green-400">recoder config list</div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Examples</h2>
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Create a new Next.js project</div>
                <div className="text-green-400">recoder "create a Next.js app with Tailwind and TypeScript"</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Add features to existing project</div>
                <div className="text-green-400">recoder "add user authentication with JWT"</div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 font-mono text-sm">
                <div className="text-gray-400 mb-2"># Fix bugs</div>
                <div className="text-green-400">recoder "fix the TypeScript errors in src/api"</div>
              </div>
            </div>
          </section>

          <div className="flex space-x-4">
            <Link
              href="/cli"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              <Download className="w-5 h-5" />
              <span>Download CLI</span>
            </Link>
            <Link
              href="/docs/api-keys"
              className="inline-flex items-center space-x-2 px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg font-medium transition-all"
            >
              <span>Setup API Keys</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
