import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documentation - Recoder.xyz',
  description: 'Learn how to use Recoder.xyz AI-powered development platform',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            Documentation
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to know about using Recoder.xyz AI-powered development platform
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          
          {/* Getting Started */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">Getting Started</h3>
            <p className="text-gray-600 mb-4">
              Learn the basics of using Recoder.xyz to generate, edit, and deploy applications with AI.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• Quick start guide</li>
              <li>• Your first AI-generated app</li>
              <li>• Understanding the interface</li>
            </ul>
            <Link href="/docs/installation" className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
              Installation Guide →
            </Link>
          </div>

          {/* CLI Documentation */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">CLI Tools</h3>
            <p className="text-gray-600 mb-4">
              Master the powerful Recoder CLI for terminal-based AI development.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• Command reference</li>
              <li>• Natural language interface</li>
              <li>• Project templates</li>
            </ul>
            <Link href="/cli" className="text-green-600 hover:text-green-800 font-semibold text-sm">
              CLI Documentation →
            </Link>
          </div>

          {/* API Reference */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">API Reference</h3>
            <p className="text-gray-600 mb-4">
              Complete API documentation for integrating Recoder into your workflow.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• REST API endpoints</li>
              <li>• SDK examples</li>
              <li>• Authentication guide</li>
            </ul>
            <Link href="/docs/api" className="text-purple-600 hover:text-purple-800 font-semibold text-sm">
              API Documentation →
            </Link>
          </div>

          {/* AI Models */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">AI Models</h3>
            <p className="text-gray-600 mb-4">
              Discover the different AI models available and how to choose the right one for your project.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• Claude, GPT, and Llama models</li>
              <li>• Model comparison and selection</li>
              <li>• Performance optimization</li>
            </ul>
            <Link href="/docs/models" className="text-orange-600 hover:text-orange-800 font-semibold text-sm">
              Model Guide →
            </Link>
          </div>

          {/* Web Platform */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">Web Platform</h3>
            <p className="text-gray-600 mb-4">
              Learn how to use the web-based editor and collaboration features.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• Code editor features</li>
              <li>• Real-time collaboration</li>
              <li>• Deployment options</li>
            </ul>
            <Link href="/docs/web" className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">
              Web Guide →
            </Link>
          </div>

          {/* Tutorials */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">Tutorials</h3>
            <p className="text-gray-600 mb-4">
              Step-by-step tutorials for common development tasks and workflows.
            </p>
            <ul className="space-y-2 text-sm text-gray-500 mb-4">
              <li>• Building a React app</li>
              <li>• Creating APIs</li>
              <li>• Deployment guides</li>
            </ul>
            <Link href="/docs/tutorials" className="text-red-600 hover:text-red-800 font-semibold text-sm">
              View Tutorials →
            </Link>
          </div>

        </div>

        {/* Quick Actions */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold mb-8">Ready to Get Started?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/"
              className="inline-flex items-center px-8 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Try the Platform
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <Link 
              href="/chat"
              className="inline-flex items-center px-8 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Start with Chat
            </Link>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mt-16 bg-white rounded-xl shadow-lg p-8 text-center">
          <h3 className="text-2xl font-bold mb-4">Need Help?</h3>
          <p className="text-gray-600 mb-6">
            Can&apos;t find what you&apos;re looking for? Our team is here to help you succeed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="mailto:support@recoder.xyz"
              className="inline-flex items-center px-6 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Support
            </a>
            <a 
              href="https://github.com/recoder-xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <svg className="mr-2 w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
