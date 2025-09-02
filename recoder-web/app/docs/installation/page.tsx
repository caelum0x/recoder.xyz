import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Installation Guide - Recoder.xyz',
  description: 'How to install and set up Recoder.xyz CLI and platform',
};

export default function InstallationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            Installation Guide
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Get started with Recoder.xyz in minutes
          </p>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-3xl font-bold mb-6">Quick Installation</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">1. Install the CLI</h3>
                <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                  <div className="mb-2 text-gray-400"># Install globally via npm</div>
                  <div className="text-white">npm install -g @recoder/cli</div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3">2. Authenticate</h3>
                <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                  <div className="mb-2 text-gray-400"># Login to your Recoder account</div>
                  <div className="text-white">recoder auth login</div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3">3. Verify Installation</h3>
                <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                  <div className="mb-2 text-gray-400"># Check version</div>
                  <div className="text-white">recoder --version</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-3xl font-bold mb-6">Web Platform</h2>
            
            <div className="space-y-4">
              <p className="text-gray-700">
                The web platform requires no installation - just visit our website and sign in:
              </p>
              
              <div className="flex gap-4">
                <Link
                  href="/"
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Go to Web Platform
                </Link>
                <Link
                  href="/docs"
                  className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Back to Docs
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold mb-6">System Requirements</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">Minimum Requirements</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Node.js 18.0 or higher</li>
                  <li>• npm 8.0 or higher</li>
                  <li>• 2GB RAM</li>
                  <li>• Internet connection</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-3">Recommended</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Node.js 20.0 or higher</li>
                  <li>• npm 10.0 or higher</li>
                  <li>• 8GB RAM</li>
                  <li>• Fast internet connection</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
