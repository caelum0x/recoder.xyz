'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_ENDPOINTS = [
  {
    name: 'Device Code - Generate',
    method: 'POST',
    path: '/api/auth/cli/device',
    description: 'Start CLI authentication flow',
    body: { client_id: 'recoder-cli' }
  },
  {
    name: 'Device Code - Authorize',
    method: 'POST',
    path: '/api/auth/cli/authorize',
    description: 'Authorize device code (requires auth)',
    body: { user_code: 'ABCD-1234', action: 'approve' },
    requiresAuth: true
  },
  {
    name: 'Device Code - Poll Token',
    method: 'POST',
    path: '/api/auth/cli/token',
    description: 'Poll for access token',
    body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'abc123...' }
  },
  {
    name: 'Verify Token',
    method: 'POST',
    path: '/api/auth/cli/verify',
    description: 'Verify access token',
    body: { access_token: 'reco_...' }
  },
  {
    name: 'List CLI Sessions',
    method: 'GET',
    path: '/api/auth/cli/sessions',
    description: 'List active CLI sessions',
    requiresAuth: true
  },
  {
    name: 'List API Keys',
    method: 'GET',
    path: '/api/auth/cli/keys',
    description: 'List API keys',
    requiresAuth: true
  },
  {
    name: 'Create API Key',
    method: 'POST',
    path: '/api/auth/cli/keys',
    description: 'Create new API key',
    body: { name: 'My API Key', description: 'For testing', scopes: ['cli:full'] },
    requiresAuth: true
  },
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export default function PlaygroundPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0]);
  const [method, setMethod] = useState(selectedEndpoint.method);
  const [endpoint, setEndpoint] = useState(selectedEndpoint.path);
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState(JSON.stringify(selectedEndpoint.body || {}, null, 2));
  const [response, setResponse] = useState('');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    setMethod(selectedEndpoint.method);
    setEndpoint(selectedEndpoint.path);
    setBody(JSON.stringify(selectedEndpoint.body || {}, null, 2));
  }, [selectedEndpoint]);

  const sendRequest = async () => {
    try {
      setLoading(true);
      setResponse('');
      setResponseTime(null);
      setStatusCode(null);

      const startTime = Date.now();

      const options: RequestInit = {
        method,
        headers: JSON.parse(headers),
      };

      if (method !== 'GET' && body) {
        options.body = body;
      }

      const res = await fetch(endpoint, options);
      const endTime = Date.now();
      const data = await res.json();

      setResponse(JSON.stringify(data, null, 2));
      setResponseTime(endTime - startTime);
      setStatusCode(res.status);

      // Add to history
      setHistory(prev => [
        {
          timestamp: new Date().toISOString(),
          method,
          endpoint,
          statusCode: res.status,
          responseTime: endTime - startTime,
        },
        ...prev.slice(0, 9), // Keep last 10
      ]);
    } catch (error: any) {
      setResponse(JSON.stringify({ error: error.message }, null, 2));
      setStatusCode(0);
    } finally {
      setLoading(false);
    }
  };

  const getCodeExample = (lang: 'curl' | 'javascript' | 'python') => {
    const parsedHeaders = JSON.parse(headers);
    const headerStr = Object.entries(parsedHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    if (lang === 'curl') {
      const headerFlags = Object.entries(parsedHeaders)
        .map(([k, v]) => `-H "${k}: ${v}"`)
        .join(' \\\n  ');

      if (method === 'GET') {
        return `curl -X ${method} \\\n  ${headerFlags} \\\n  ${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}${endpoint}`;
      } else {
        return `curl -X ${method} \\\n  ${headerFlags} \\\n  -d '${body}' \\\n  ${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}${endpoint}`;
      }
    }

    if (lang === 'javascript') {
      return `const response = await fetch('${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}${endpoint}', {
  method: '${method}',
  headers: ${JSON.stringify(parsedHeaders, null, 2)},${method !== 'GET' ? `\n  body: JSON.stringify(${body})` : ''}
});

const data = await response.json();
console.log(data);`;
    }

    if (lang === 'python') {
      return `import requests
import json

url = '${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}${endpoint}'
headers = ${JSON.stringify(parsedHeaders, null, 2)}${method !== 'GET' ? `\ndata = ${body}` : ''}

response = requests.${method.toLowerCase()}(url, headers=headers${method !== 'GET' ? ', json=data' : ''})
print(response.json())`;
    }

    return '';
  };

  const [codeTab, setCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-orange-500 to-purple-600 text-white px-3 py-1 rounded-lg font-bold">
                recoder.xyz
              </div>
              <span className="text-gray-400">/ Playground</span>
            </Link>
            {session ? (
              <Link
                href="/dashboard"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sidebar - Endpoints */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">API Endpoints</h2>
              <div className="space-y-2">
                {API_ENDPOINTS.map((ep, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedEndpoint(ep)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedEndpoint === ep
                        ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{ep.method}</span>
                      {ep.requiresAuth && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded">
                          Auth
                        </span>
                      )}
                    </div>
                    <div className="font-semibold mt-1">{ep.name}</div>
                    <div className="text-xs opacity-75 mt-1">{ep.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Request History */}
            {history.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-4">History</h2>
                <div className="space-y-2">
                  {history.map((item, idx) => (
                    <div key={idx} className="bg-gray-900 p-3 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-400 font-mono text-xs">{item.method}</span>
                        <span className={`text-xs ${item.statusCode < 300 ? 'text-green-500' : 'text-red-500'}`}>
                          {item.statusCode}
                        </span>
                      </div>
                      <div className="text-gray-300 text-xs truncate">{item.endpoint}</div>
                      <div className="text-gray-500 text-xs mt-1">{item.responseTime}ms</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request Builder */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">Request</h2>

              {/* Method & Endpoint */}
              <div className="flex gap-3 mb-4">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {HTTP_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="/api/endpoint"
                />
                <button
                  onClick={sendRequest}
                  disabled={loading}
                  className="bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold px-8 py-2 rounded-lg transition-all disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>

              {/* Headers */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Headers</label>
                <textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                  rows={4}
                />
              </div>

              {/* Body */}
              {method !== 'GET' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Body</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                    rows={8}
                  />
                </div>
              )}
            </div>

            {/* Response */}
            {(response || loading) && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">Response</h2>
                  {statusCode !== null && (
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        statusCode < 300 ? 'bg-green-500/20 text-green-500' :
                        statusCode < 400 ? 'bg-yellow-500/20 text-yellow-500' :
                        'bg-red-500/20 text-red-500'
                      }`}>
                        {statusCode}
                      </span>
                      {responseTime !== null && (
                        <span className="text-gray-400 text-sm">{responseTime}ms</span>
                      )}
                    </div>
                  )}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                  </div>
                ) : (
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono text-sm border border-gray-700">
                    {response}
                  </pre>
                )}
              </div>
            )}

            {/* Code Examples */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-bold text-white mb-4">Code Examples</h2>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setCodeTab('curl')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    codeTab === 'curl'
                      ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                      : 'bg-gray-900 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  cURL
                </button>
                <button
                  onClick={() => setCodeTab('javascript')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    codeTab === 'javascript'
                      ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                      : 'bg-gray-900 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  JavaScript
                </button>
                <button
                  onClick={() => setCodeTab('python')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    codeTab === 'python'
                      ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                      : 'bg-gray-900 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Python
                </button>
              </div>

              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono text-sm border border-gray-700">
                {getCodeExample(codeTab)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
