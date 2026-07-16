'use client';

import { Card } from '@/components/ui/card';
import { Monitor } from 'lucide-react';

export default function SessionsTable({ sessions, onRefresh }: { sessions: any[]; onRefresh: () => void }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Monitor className="w-5 h-5 text-green-600" />
        Active CLI Sessions
      </h2>
      {sessions.length === 0 ? (
        <p className="text-center py-8 text-gray-500">No active sessions</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session: any) => (
            <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{session.deviceInfo?.platform || 'Unknown'}</p>
                <p className="text-sm text-gray-600">Last used: {new Date(session.lastUsedAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
