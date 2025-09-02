import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'API Reference - Recoder.xyz',
  description: 'Complete API reference for Recoder.xyz platform',
};

export default function APIReferencePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            API Reference
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Complete reference for Recoder.xyz REST API and SDK
          </p>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            
            {/* Authentication */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">🔐 Authentication</h3>
              <p className="text-gray-600 mb-4">
                Secure API access with OAuth 2.0 and API keys
              </p>
              <div className="space-y-2 text-sm">
                <div className="font-mono bg-gray-100 p-2 rounded">POST /auth/login</div>
                <div className="font-mono bg-gray-100 p-2 rounded">GET /auth/profile</div>
                <div className="font-mono bg-gray-100 p-2 rounded">POST /auth/refresh</div>
              </div>
            </div>

            {/* Projects */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">📁 Projects</h3>
              <p className="text-gray-600 mb-4">
                Create, manage, and deploy AI-generated projects
              </p>
              <div className="space-y-2 text-sm">
                <div className="font-mono bg-gray-100 p-2 rounded">GET /api/projects</div>
                <div className="font-mono bg-gray-100 p-2 rounded">POST /api/projects</div>
                <div className="font-mono bg-gray-100 p-2 rounded">PUT /api/projects/:id</div>
              </div>
            </div>

            {/* AI Generation */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold mb-4">🤖 AI Generation</h3>
              <p className="text-gray-600 mb-4">
                Generate code with multiple AI models
              </p>
              <div className="space-y-2 text-sm">
                <div className="font-mono bg-gray-100 p-2 rounded">POST /api/ai/generate</div>
                <div className="font-mono bg-gray-100 p-2 rounded">POST /api/ai/chat</div>
                <div className="font-mono bg-gray-100 p-2 rounded">GET /api/ai/models</div>
              </div>
            </div>

          </div>

          {/* Detailed Documentation */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-3xl font-bold mb-6">Quick Start</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">1. Get API Key</h3>
                <p className="text-gray-700 mb-3">
                  Sign in to your Recoder account and generate an API key from the dashboard.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                  <div className="mb-2 text-gray-400"># Set your API key</div>
                  <div className="text-white">export RECODER_API_KEY="your-api-key-here"</div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3">2. Make Your First Request</h3>
                <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                  <div className="mb-2 text-gray-400"># Generate a new project</div>
                  <div className="text-white">curl -X POST https://api.recoder.xyz/api/projects \</div>
                  <div className="text-white ml-4">-H "Authorization: Bearer $RECODER_API_KEY" \</div>
                  <div className="text-white ml-4">-H "Content-Type: application/json" \</div>
                  <div className="text-white ml-4">-d &apos;{JSON.stringify({prompt: "Build a React todo app"})}&apos;</div>
                </div>
              </div>
            </div>
          </div>

          {/* SDK Examples */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold mb-6">SDK Examples</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-3">JavaScript/TypeScript</h3>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <pre className="text-green-400">
{`import { RecoderAPI } from '@recoder/sdk'

const recoder = new RecoderAPI('your-api-key')

const project = await recoder.projects.create({
  prompt: 'Build a React todo app'
})`}
                  </pre>
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-3">Python</h3>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <pre className="text-green-400">
{`from recoder import RecoderAPI

recoder = RecoderAPI('your-api-key')

project = recoder.projects.create(
    prompt='Build a React todo app'
)`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              href="/docs"
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Back to Documentation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
