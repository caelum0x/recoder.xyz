'use client';

import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

export default function TestPage() {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState('Hello! Can you help me?');
  const [logs, setLogs] = useState<string[]>([]);
  const [chatResponse, setChatResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const log = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    setLogs(prev => [...prev, `${emoji} [${timestamp}] ${msg}`]);
  };

  const handleGuestSignIn = async () => {
    setLogs([]);
    log('Starting guest authentication...');
    try {
      const result = await signIn('guest', {
        callbackUrl: '/',
        redirect: false,
      });

      if (result?.error) {
        log(`Error: ${result.error}`, 'error');
      } else if (result?.ok) {
        log('Guest authentication successful!', 'success');
      }
    } catch (error: any) {
      log(`Error: ${error.message}`, 'error');
    }
  };

  const handleSendChat = async () => {
    setLogs([]);
    setChatResponse('');
    setIsLoading(true);

    log('Sending chat message...');

    try {
      const payload = {
        id: `chat-${Date.now()}`,
        messages: [
          {
            role: 'user',
            content: message,
            id: `msg-${Date.now()}`,
          }
        ],
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      log(`Response: ${response.status}`);

      if (response.ok) {
        log('Chat working!', 'success');
      } else {
        const text = await response.text();
        log(`Error: ${text.substring(0, 200)}`, 'error');
      }
    } catch (error: any) {
      log(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">🧪 Chat Test</h1>

          <div className="mb-4 p-4 bg-gray-100 rounded">
            <p><strong>Status:</strong> {status}</p>
            {session && (
              <>
                <p><strong>User:</strong> {session.user?.email}</p>
                <p><strong>Type:</strong> {session.user?.type}</p>
              </>
            )}
          </div>

          <button
            onClick={handleGuestSignIn}
            disabled={status === 'authenticated'}
            className="bg-blue-600 text-white px-4 py-2 rounded mr-2"
          >
            Sign In as Guest
          </button>

          <div className="mt-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-2"
            />
            <button
              onClick={handleSendChat}
              disabled={isLoading || status !== 'authenticated'}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Send Message
            </button>
          </div>

          <div className="mt-4 bg-gray-900 p-4 rounded max-h-96 overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="text-gray-300 text-xs font-mono">{log}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
