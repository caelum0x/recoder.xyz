import Link from 'next/link';
import { ArrowLeft, Sparkles, Terminal, Globe, Repeat, CheckCircle, AlertCircle, Zap, Code, Cloud } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';

export default function WebCLISyncGuidePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-5xl">
          {/* Breadcrumb */}
          <div className="mb-8 flex items-center space-x-2 text-sm text-gray-400">
            <Link href="/docs/getting-started" className="hover:text-orange-500 transition-colors">
              Documentation
            </Link>
            <span>/</span>
            <span className="text-white">Web ↔ CLI Sync</span>
          </div>

          {/* Title Section */}
          <div className="mb-12">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-600/20 border border-orange-500/30">
                <Repeat className="w-8 h-8 text-orange-500" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">
                Web ↔ CLI Sync Workflow
              </h1>
            </div>
            <p className="text-xl text-gray-400 leading-relaxed">
              Work seamlessly between the browser and your terminal. Start coding anywhere,
              continue anywhere. Your projects stay in perfect sync.
            </p>
          </div>

          {/* Hero Visual */}
          <section className="mb-12 p-8 rounded-2xl bg-gradient-to-br from-orange-500/10 via-purple-500/10 to-blue-500/10 border border-orange-500/30">
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <div className="flex flex-col items-center text-center p-6 rounded-xl bg-black/30 border border-white/10">
                <Globe className="w-12 h-12 text-blue-400 mb-3" />
                <h3 className="font-bold text-white mb-2">Web IDE</h3>
                <p className="text-sm text-gray-400">
                  Quick prototyping, visual editing, instant preview
                </p>
              </div>

              <div className="flex flex-col items-center">
                <Repeat className="w-16 h-16 text-orange-500 animate-pulse" />
                <p className="text-sm text-gray-400 mt-3 font-semibold">Seamless Sync</p>
              </div>

              <div className="flex flex-col items-center text-center p-6 rounded-xl bg-black/30 border border-white/10">
                <Terminal className="w-12 h-12 text-green-400 mb-3" />
                <h3 className="font-bold text-white mb-2">Terminal CLI</h3>
                <p className="text-sm text-gray-400">
                  Full power, your tools, local development
                </p>
              </div>
            </div>

            <div className="mt-8 p-6 rounded-xl bg-green-500/10 border border-green-500/30">
              <h3 className="font-semibold text-green-400 mb-3 flex items-center space-x-2">
                <Sparkles className="w-5 h-5" />
                <span>Why This is Revolutionary</span>
              </h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start space-x-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong className="text-white">Start anywhere:</strong> Prototype in the browser, build in your terminal</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong className="text-white">No context switching:</strong> Your AI understands your entire project history</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong className="text-white">True flexibility:</strong> Use web for quick edits, CLI for deep work</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Setup Guide */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Quick Setup
              </span>
            </h2>

            <div className="space-y-8">
              {/* Step 1 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Install Recoder CLI</h3>
                    <p className="text-gray-400 mb-4">
                      First, install the Recoder CLI globally on your machine:
                    </p>
                    <div className="p-4 rounded-lg bg-black/30 border border-white/10 font-mono text-sm">
                      <div className="text-gray-400 mb-2"># Using npm</div>
                      <div className="text-green-400">npm install -g @recoder/cli</div>
                      <div className="text-gray-400 mt-4 mb-2"># Or using yarn</div>
                      <div className="text-green-400">yarn global add @recoder/cli</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Link Your Account</h3>
                    <p className="text-gray-400 mb-4">
                      Connect your terminal to your Recoder.xyz account:
                    </p>
                    <div className="p-4 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mb-4">
                      <div className="text-green-400">recoder login</div>
                    </div>
                    <div className="space-y-3 text-gray-400 text-sm">
                      <p>This will:</p>
                      <ul className="list-disc list-inside space-y-2 ml-4">
                        <li>Open your browser to authenticate</li>
                        <li>Generate a secure device code</li>
                        <li>Link your terminal to your web account</li>
                        <li>Sync your projects and AI settings</li>
                      </ul>
                    </div>
                    <div className="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="text-blue-300 font-semibold mb-1">One-Time Setup</p>
                          <p className="text-gray-400">
                            You only need to do this once. Your CLI will stay authenticated across sessions.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">Verify Connection</h3>
                    <p className="text-gray-400 mb-4">
                      Check that everything is working:
                    </p>
                    <div className="p-4 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mb-4">
                      <div className="text-green-400 mb-2">recoder whoami</div>
                      <div className="text-gray-400 mt-2">
                        # Output:<br />
                        # ✓ Logged in as: your.email@example.com<br />
                        # ✓ Projects synced: 3<br />
                        # ✓ AI providers configured: OpenRouter, Anthropic
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                      <div className="flex items-start space-x-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="text-green-300 font-semibold mb-1">✅ All Set!</p>
                          <p className="text-gray-400">
                            Your terminal is now connected to your Recoder.xyz account. Let's explore the workflows!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Workflow Examples */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Common Workflows
              </span>
            </h2>

            <div className="space-y-8">
              {/* Workflow 1: Web to CLI */}
              <div className="p-6 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="flex items-start space-x-4 mb-6">
                  <Cloud className="w-8 h-8 text-blue-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-2xl font-bold mb-2 text-blue-400">Workflow 1: Start in Web, Continue in Terminal</h3>
                    <p className="text-gray-400">
                      Perfect for prototyping quickly, then moving to your local environment for deep work.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Create project in Web IDE</p>
                      <p className="text-sm text-gray-400">
                        Go to <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 underline">dashboard</Link>,
                        click "New Project", build your initial prototype with AI assistance.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Pull to your local machine</p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mt-2">
                        <span className="text-gray-400"># List your projects</span><br />
                        <span className="text-green-400">recoder projects list</span><br /><br />
                        <span className="text-gray-400"># Download specific project</span><br />
                        <span className="text-green-400">recoder pull my-awesome-app</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Continue development locally</p>
                      <p className="text-sm text-gray-400 mb-2">
                        Now you have the full project locally. Use your favorite IDE, run tests, commit to git:
                      </p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm">
                        <span className="text-green-400">cd my-awesome-app</span><br />
                        <span className="text-green-400">code .</span><br />
                        <span className="text-green-400">npm install && npm run dev</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Push changes back</p>
                      <p className="text-sm text-gray-400 mb-2">
                        After making changes, sync back to the cloud:
                      </p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm">
                        <span className="text-green-400">recoder push</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        Your changes are now visible in the Web IDE! Chat history preserved.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workflow 2: CLI to Web */}
              <div className="p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-transparent">
                <div className="flex items-start space-x-4 mb-6">
                  <Terminal className="w-8 h-8 text-purple-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-2xl font-bold mb-2 text-purple-400">Workflow 2: Start in Terminal, View in Web</h3>
                    <p className="text-gray-400">
                      Perfect for developers who prefer local development but want visual preview capabilities.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Create project with CLI</p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mt-2">
                        <span className="text-green-400">recoder create react-dashboard</span><br />
                        <span className="text-green-400">cd react-dashboard</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Build with AI in terminal</p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mt-2">
                        <span className="text-green-400">recoder chat</span><br />
                        <span className="text-gray-400">&gt; Create a modern dashboard with charts</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Push to cloud for visual preview</p>
                      <div className="p-3 rounded-lg bg-black/30 border border-white/10 font-mono text-sm mt-2">
                        <span className="text-green-400">recoder push --open</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        The <code className="px-2 py-1 rounded bg-black/30 text-orange-400">--open</code> flag
                        automatically opens the Web IDE with live preview!
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Share and collaborate</p>
                      <p className="text-sm text-gray-400">
                        Your project is now accessible via web URL. Share with team, demo to clients,
                        or make quick visual tweaks in the browser.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workflow 3: Hybrid */}
              <div className="p-6 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent">
                <div className="flex items-start space-x-4 mb-6">
                  <Zap className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-2xl font-bold mb-2 text-orange-400">Workflow 3: Hybrid Development (Pro Mode)</h3>
                    <p className="text-gray-400">
                      The ultimate workflow: leverage strengths of both environments simultaneously.
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-xl bg-black/30 border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center space-x-2">
                      <Globe className="w-5 h-5 text-blue-400" />
                      <span>Use Web IDE For:</span>
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-400">
                      <li className="flex items-start space-x-2">
                        <span className="text-blue-400">→</span>
                        <span>Quick UI iterations and visual tweaks</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-blue-400">→</span>
                        <span>Instant preview of frontend changes</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-blue-400">→</span>
                        <span>Sharing demos with stakeholders</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-blue-400">→</span>
                        <span>AI pair programming for exploration</span>
                      </li>
                    </ul>
                  </div>

                  <div className="p-5 rounded-xl bg-black/30 border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center space-x-2">
                      <Terminal className="w-5 h-5 text-green-400" />
                      <span>Use Terminal CLI For:</span>
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-400">
                      <li className="flex items-start space-x-2">
                        <span className="text-green-400">→</span>
                        <span>Complex refactoring and debugging</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-green-400">→</span>
                        <span>Running tests and build processes</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-green-400">→</span>
                        <span>Git workflows and version control</span>
                      </li>
                      <li className="flex items-start space-x-2">
                        <span className="text-green-400">→</span>
                        <span>Working with your favorite local tools</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <p className="text-sm text-gray-400">
                    <strong className="text-orange-400">Pro Tip:</strong> Keep both open! Edit in your terminal
                    with VSCode, push changes, then instantly see the preview in Web IDE. Best of both worlds.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CLI Commands Reference */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Essential CLI Commands
              </span>
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Project Management */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-white mb-4 flex items-center space-x-2">
                  <Code className="w-5 h-5 text-orange-500" />
                  <span>Project Management</span>
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder projects list</div>
                    <div className="text-xs text-gray-400">List all your synced projects</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder pull [project-name]</div>
                    <div className="text-xs text-gray-400">Download project from cloud to local</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder push</div>
                    <div className="text-xs text-gray-400">Upload local changes to cloud</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder status</div>
                    <div className="text-xs text-gray-400">Check sync status and changes</div>
                  </div>
                </div>
              </div>

              {/* AI & Chat */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                <h3 className="font-bold text-white mb-4 flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <span>AI & Chat</span>
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder chat</div>
                    <div className="text-xs text-gray-400">Start AI chat session (uses your web settings)</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder chat --model claude-3.5-sonnet</div>
                    <div className="text-xs text-gray-400">Specify which model to use</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder generate "description"</div>
                    <div className="text-xs text-gray-400">Generate code from natural language</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm text-green-400 mb-1">recoder context</div>
                    <div className="text-xs text-gray-400">View current project context and history</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Best Practices
              </span>
            </h2>

            <div className="space-y-4">
              <div className="p-5 rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/5 to-transparent">
                <h3 className="font-semibold text-green-400 mb-2 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>✅ DO: Sync Frequently</span>
                </h3>
                <p className="text-sm text-gray-400">
                  Run <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder push</code> after significant
                  changes. This keeps your work backed up and accessible from anywhere.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/5 to-transparent">
                <h3 className="font-semibold text-green-400 mb-2 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>✅ DO: Use Web for Demos</span>
                </h3>
                <p className="text-sm text-gray-400">
                  When presenting to clients or team, push to web and share the live preview URL. No deployment needed!
                </p>
              </div>

              <div className="p-5 rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/5 to-transparent">
                <h3 className="font-semibold text-green-400 mb-2 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>✅ DO: Leverage Both for Learning</span>
                </h3>
                <p className="text-sm text-gray-400">
                  Use Web IDE to experiment and learn, then pull locally to see the full project structure and understand the architecture.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/5 to-transparent">
                <h3 className="font-semibold text-red-400 mb-2 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>❌ DON'T: Forget to Pull Before Editing</span>
                </h3>
                <p className="text-sm text-gray-400">
                  If you made changes in the web IDE, run <code className="px-2 py-1 rounded bg-black/30 text-red-400">recoder pull</code> before
                  editing locally to avoid conflicts.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/5 to-transparent">
                <h3 className="font-semibold text-red-400 mb-2 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>❌ DON'T: Push Sensitive Data</span>
                </h3>
                <p className="text-sm text-gray-400">
                  Always check your <code className="px-2 py-1 rounded bg-black/30">.gitignore</code> and ensure API keys, secrets,
                  and large files aren't synced to the cloud.
                </p>
              </div>
            </div>
          </section>

          {/* Troubleshooting */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-8 flex items-center space-x-3">
              <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                Troubleshooting
              </span>
            </h2>

            <div className="space-y-4">
              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>🔐 "Not authenticated" error</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you're seeing authentication errors:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Run <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder login</code> to re-authenticate</li>
                    <li>Check your internet connection</li>
                    <li>Make sure you completed the browser authentication flow</li>
                    <li>Try <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder logout</code> then login again</li>
                  </ul>
                </div>
              </details>

              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>⚠️ Sync conflicts</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If you have conflicting changes between web and local:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Run <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder status</code> to see conflicts</li>
                    <li>Use <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder pull --force</code> to overwrite local with cloud</li>
                    <li>Or <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder push --force</code> to overwrite cloud with local</li>
                    <li>For complex merges, resolve manually and push</li>
                  </ul>
                </div>
              </details>

              <details className="p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl group">
                <summary className="cursor-pointer font-semibold text-lg flex items-center justify-between">
                  <span>🐌 Slow sync speeds</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-white/10 text-gray-400 space-y-2">
                  <p>If syncing is taking too long:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Check your <code className="px-2 py-1 rounded bg-black/30">.recoderignore</code> file - exclude node_modules, build folders</li>
                    <li>Large files (&gt;100MB) should be avoided in sync</li>
                    <li>Use <code className="px-2 py-1 rounded bg-black/30 text-green-400">recoder push --compress</code> for faster uploads</li>
                    <li>Check your network connection and firewall settings</li>
                  </ul>
                </div>
              </details>
            </div>
          </section>

          {/* Next Steps */}
          <section className="p-8 rounded-2xl bg-gradient-to-br from-orange-500/10 to-purple-600/10 border border-orange-500/30">
            <h2 className="text-2xl font-bold mb-4 flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-orange-400" />
              <span>Start Syncing Today!</span>
            </h2>
            <p className="text-gray-400 mb-6">
              Experience the power of seamless Web ↔ CLI workflow. Build anywhere, deploy everywhere.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/dashboard"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  Try Web IDE →
                </h3>
                <p className="text-sm text-gray-400">
                  Start a project in the browser
                </p>
              </Link>
              <a
                href="https://www.npmjs.com/package/@recoder/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  Install CLI →
                </h3>
                <p className="text-sm text-gray-400">
                  Get the terminal tools
                </p>
              </a>
              <Link
                href="/docs/getting-started"
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <h3 className="font-semibold mb-2 group-hover:text-orange-500 transition-colors">
                  Full Docs →
                </h3>
                <p className="text-sm text-gray-400">
                  Learn all the features
                </p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
