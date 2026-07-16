'use client';

import { useState, useEffect } from 'react';
import { MCPSettings } from '../mcp/MCPSettings';

export function MCPButton() {
  const [serverCount, setServerCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadServerCount();
  }, []);

  async function loadServerCount() {
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      setServerCount(data.servers?.length || 0);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
        title="MCP Tools"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>MCP</span>
        {serverCount > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
            {serverCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">MCP Servers</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <MCPSettings />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
