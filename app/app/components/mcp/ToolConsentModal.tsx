'use client';

import { useState } from 'react';

interface ToolConsentModalProps {
  toolName: string;
  serverId: string;
  params: any;
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolConsentModal({ toolName, serverId, params, onApprove, onDeny }: ToolConsentModalProps) {
  const [remember, setRemember] = useState(false);

  const handleApprove = () => {
    if (remember) {
      localStorage.setItem(`mcp-consent-${serverId}-${toolName}`, 'approved');
    }
    onApprove();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">Tool Execution Request</h2>
        
        <div className="space-y-3 mb-6">
          <div>
            <span className="text-sm text-gray-600">Server:</span>
            <div className="font-medium">{serverId}</div>
          </div>
          
          <div>
            <span className="text-sm text-gray-600">Tool:</span>
            <div className="font-medium">{toolName}</div>
          </div>
          
          <div>
            <span className="text-sm text-gray-600">Parameters:</span>
            <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="rounded"
          />
          <span>Remember my choice for this tool</span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onDeny}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Deny
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export function checkToolConsent(serverId: string, toolName: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`mcp-consent-${serverId}-${toolName}`) === 'approved';
}
