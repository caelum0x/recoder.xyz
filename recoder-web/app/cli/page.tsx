import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CLI Documentation - Recoder.xyz',
  description: 'Complete guide to using the Recoder CLI for AI-powered development',
};

export default function CLIDocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            Recoder CLI
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            The most powerful AI-powered command-line interface for developers. Generate, refactor, and deploy code directly from your terminal.
          </p>
        </div>

        {/* Quick Start */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-12 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-6">Quick Start</h2>
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
              <div className="mb-2"># Install Recoder CLI globally</div>
              <div className="text-white">npm install -g @recoder/cli</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
              <div className="mb-2"># Authenticate with your Recoder account</div>
              <div className="text-white">recoder auth login</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
              <div className="mb-2"># Generate your first project</div>
              <div className="text-white">recoder generate "Build a React todo app"</div>
            </div>
          </div>
        </div>

        {/* Command Reference */}
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">Command Reference</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Authentication Commands */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <svg className="w-6 h-6 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Authentication
              </h3>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder auth login</code>
                  <p className="text-sm text-gray-600 mt-1">Authenticate with your Recoder account</p>
                </div>
                <div className="border-l-4 border-blue-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder auth logout</code>
                  <p className="text-sm text-gray-600 mt-1">Sign out of your account</p>
                </div>
                <div className="border-l-4 border-blue-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder auth status</code>
                  <p className="text-sm text-gray-600 mt-1">Check authentication status</p>
                </div>
              </div>
            </div>

            {/* Generation Commands */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Code Generation
              </h3>
              <div className="space-y-3">
                <div className="border-l-4 border-green-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder generate &lt;prompt&gt;</code>
                  <p className="text-sm text-gray-600 mt-1">Generate code from natural language</p>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder refactor &lt;file&gt;</code>
                  <p className="text-sm text-gray-600 mt-1">Refactor existing code with AI</p>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder explain &lt;file&gt;</code>
                  <p className="text-sm text-gray-600 mt-1">Get AI explanations of your code</p>
                </div>
              </div>
            </div>

            {/* Project Commands */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <svg className="w-6 h-6 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Project Management
              </h3>
              <div className="space-y-3">
                <div className="border-l-4 border-purple-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder init</code>
                  <p className="text-sm text-gray-600 mt-1">Initialize a new Recoder project</p>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder sync</code>
                  <p className="text-sm text-gray-600 mt-1">Sync project with Recoder cloud</p>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder status</code>
                  <p className="text-sm text-gray-600 mt-1">Check project and sync status</p>
                </div>
              </div>
            </div>

            {/* Deployment Commands */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center">
                <svg className="w-6 h-6 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Deployment
              </h3>
              <div className="space-y-3">
                <div className="border-l-4 border-red-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder deploy</code>
                  <p className="text-sm text-gray-600 mt-1">Deploy to production platforms</p>
                </div>
                <div className="border-l-4 border-red-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder preview</code>
                  <p className="text-sm text-gray-600 mt-1">Create preview deployment</p>
                </div>
                <div className="border-l-4 border-red-500 pl-4">
                  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">recoder domains</code>
                  <p className="text-sm text-gray-600 mt-1">Manage custom domains</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Advanced Features */}
        <div className="max-w-4xl mx-auto mt-16">
          <h2 className="text-3xl font-bold mb-8 text-center">Advanced Features</h2>
          
          <div className="space-y-8">
            
            {/* AI Model Selection */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-2xl font-semibold mb-4">AI Model Selection</h3>
              <p className="text-gray-600 mb-6">Choose the best AI model for your specific use case:</p>
              <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                <div className="mb-2"># Use Claude for complex reasoning</div>
                <div className="text-white">recoder generate "Build a GraphQL API" --model claude-3-5-sonnet</div>
                <div className="mt-4 mb-2 text-green-400"># Use GPT for creative tasks</div>
                <div className="text-white">recoder generate "Design a modern UI" --model gpt-4</div>
                <div className="mt-4 mb-2 text-green-400"># Use Llama for speed</div>
                <div className="text-white">recoder generate "Add error handling" --model llama-3.1-70b</div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-2xl font-semibold mb-4">Configuration</h3>
              <p className="text-gray-600 mb-6">Customize CLI behavior with configuration files:</p>
              <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                <div className="mb-2"># ~/.recoder/config.json</div>
                <div className="text-white">{`{
  "defaultModel": "claude-3-5-sonnet",
  "outputDirectory": "./generated",
  "autoFormat": true,
  "deploymentTarget": "vercel",
  "preferences": {
    "language": "typescript",
    "framework": "next.js",
    "styling": "tailwind"
  }
}`}</div>
              </div>
            </div>

            {/* Workflows */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-2xl font-semibold mb-4">Automated Workflows</h3>
              <p className="text-gray-600 mb-6">Create powerful automation with Recoder workflows:</p>
              <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                <div className="mb-2"># Generate full-stack application</div>
                <div className="text-white">recoder workflow run fullstack-app "E-commerce platform"</div>
                <div className="mt-4 mb-2 text-green-400"># Run test generation workflow</div>
                <div className="text-white">recoder workflow run generate-tests src/</div>
                <div className="mt-4 mb-2 text-green-400"># Custom deployment pipeline</div>
                <div className="text-white">recoder workflow run deploy-pipeline --env production</div>
              </div>
            </div>

          </div>
        </div>

        {/* Examples */}
        <div className="max-w-4xl mx-auto mt-16">
          <h2 className="text-3xl font-bold mb-8 text-center">Real-World Examples</h2>
          
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h4 className="text-lg font-semibold mb-3">Generate a React Component</h4>
              <div className="bg-gray-900 rounded-lg p-4 text-white font-mono text-sm">
                recoder generate "Create a responsive navbar component with dark mode toggle and mobile menu"
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h4 className="text-lg font-semibold mb-3">Build a Full API</h4>
              <div className="bg-gray-900 rounded-lg p-4 text-white font-mono text-sm">
                recoder generate "Build a REST API for a blog with user authentication, CRUD operations for posts, and MongoDB integration"
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h4 className="text-lg font-semibold mb-3">Refactor Legacy Code</h4>
              <div className="bg-gray-900 rounded-lg p-4 text-white font-mono text-sm">
                recoder refactor legacy-component.js "Convert to TypeScript with proper types and modern React hooks"
              </div>
            </div>
          </div>
        </div>

        {/* Getting Help */}
        <div className="max-w-4xl mx-auto mt-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
          <p className="text-gray-600 mb-6">Get assistance and support for the Recoder CLI</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <div className="bg-gray-900 rounded-lg p-3 text-white font-mono text-sm">
              recoder help
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-white font-mono text-sm">
              recoder --version
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-white font-mono text-sm">
              recoder docs
            </div>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/docs"
              className="inline-flex items-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Documentation Hub
            </a>
            <a 
              href="https://github.com/recoder-xyz/cli"
              className="inline-flex items-center px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
