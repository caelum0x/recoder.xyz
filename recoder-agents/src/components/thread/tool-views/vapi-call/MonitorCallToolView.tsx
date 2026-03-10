import React, { useState, useEffect, useRef } from 'react';
import { ToolResultData } from '../types';
import { Phone, User, PhoneCall, PhoneMissed, CheckCircle2, CheckCircle, AlertTriangle } from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { ToolViewProps } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToolViewIconTitle } from '../shared/ToolViewIconTitle';
import { ToolViewFooter } from '../shared/ToolViewFooter';
import { cn } from '@/lib/utils';
import { getToolTitle } from '../utils';
import { useVapiCallRealtime } from '@/hooks/integrations';
import { useQuery } from '@tanstack/react-query';
import { getSessionAccessToken } from '@/lib/auth/session-token';

interface MonitorCallData {
  call_id: string;
  status: string;
  phone_number?: string;
  duration_seconds?: number;
  started_at?: string;
  ended_at?: string;
  transcript?: Array<{ role: string; message: string; timestamp?: string }>;
  is_live?: boolean;
  message?: string;
}

function extractMonitorData(toolResult?: ToolResultData): MonitorCallData | null {
  if (!toolResult?.output) return null;

  try {
    let output: any = {};
    
    if (typeof toolResult.output === 'string') {
      try {
        output = JSON.parse(toolResult.output);
      } catch (e) {
        return null;
      }
    } else if (typeof toolResult.output === 'object' && toolResult.output !== null) {
      output = toolResult.output;
    }

    return {
      call_id: output.call_id || '',
      status: output.status || 'unknown',
      phone_number: output.phone_number,
      duration_seconds: output.duration_seconds,
      started_at: output.started_at,
      ended_at: output.ended_at,
      transcript: output.transcript || [],
      is_live: output.is_live,
      message: output.message
    };
  } catch (e) {
    console.error('Error extracting monitor data:', e);
    return null;
  }
}

const statusConfig = {
  'queued': { label: 'Queued', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: Phone },
  'ringing': { label: 'Ringing', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: PhoneCall },
  'in-progress': { label: 'In Progress', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: PhoneCall },
  'completed': { label: 'Completed', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: CheckCircle2 },
  'ended': { label: 'Ended', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: Phone },
  'failed': { label: 'Failed', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: PhoneMissed },
  'unknown': { label: 'Unknown', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: Phone }
};

export function MonitorCallToolView({
  toolCall,
  toolResult,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
}: ToolViewProps) {
  // All hooks must be called unconditionally at the top
  const [liveTranscript, setLiveTranscript] = useState<any[]>([]);
  const [liveStatus, setLiveStatus] = useState('unknown');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Extract data safely - handle undefined toolCall
  const initialData = extractMonitorData(toolResult);
  const name = toolCall?.function_name?.replace(/_/g, '-').toLowerCase() || 'monitor-call';
  const toolTitle = getToolTitle(name);
  
  

  // Initialize state from initialData - hook must be unconditional
  React.useEffect(() => {
    if (initialData) {
      setLiveTranscript(initialData.transcript || []);
      setLiveStatus(initialData.status || 'unknown');
    }
  }, [initialData]);

  useVapiCallRealtime(initialData?.call_id);

  // useQuery hook must be called unconditionally
  const { data: realtimeData } = useQuery({
    queryKey: ['vapi-call', initialData?.call_id],
    queryFn: async () => {
      if (!initialData?.call_id) return null;
      
      try {
        const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
        const token = await getSessionAccessToken();
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_URL}/vapi/calls/${initialData.call_id}`, {
          headers,
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Call not found, return initial data to keep showing something
            return initialData;
          }
          console.error('[MonitorCallToolView] Error fetching call data:', response.statusText);
          return null;
        }

        const data = await response.json();

        // If no data found, return initial data to keep showing something
        if (!data) {
          
          return {
            call_id: initialData.call_id,
            status: initialData.status || 'queued',
            transcript: initialData.transcript || [],
            phone_number: initialData.phone_number,
            is_live: true
          };
        }

        
        return data;
      } catch (error) {
        console.error('[MonitorCallToolView] Error fetching call data:', error);
        return null;
      }
    },
    enabled: !!initialData?.call_id,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,  // Keep in cache for 5 minutes
  });

  useEffect(() => {
    if (!realtimeData) return;
    setLiveStatus(realtimeData.status || 'unknown');
    if (realtimeData.transcript) {
      const transcript = typeof realtimeData.transcript === 'string'
        ? JSON.parse(realtimeData.transcript)
        : realtimeData.transcript;
      setLiveTranscript(Array.isArray(transcript) ? transcript : []);
    }
  }, [realtimeData]);

  // Scroll effect - hook must be unconditional
  useEffect(() => {
    if (transcriptEndRef.current && liveTranscript.length > 0) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscript]);

  if (!initialData) {
    return <div className="text-sm text-muted-foreground">No call monitoring data available</div>;
  }

  // Use the live state which is updated by real-time subscription
  const currentStatus = liveStatus;
  const statusInfo = statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.unknown;
  const StatusIcon = statusInfo.icon;
  const isActive = currentStatus === 'ringing' || currentStatus === 'in-progress' || currentStatus === 'queued';
  const currentTranscript = liveTranscript; // Always use the live transcript state

  return (
    <Card className="gap-0 flex border-0 shadow-none p-0 py-0 rounded-none flex-col overflow-hidden bg-card">
      <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "relative p-2 rounded-lg border bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 flex-shrink-0",
              isActive && "animate-pulse"
            )}>
              {isActive ? (
                <RecoderLoader customSize={20} />
              ) : (
                <StatusIcon className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Call Monitor
              </CardTitle>
              {isActive && (
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-zinc-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Call ID</div>
            <div className="text-xs font-mono text-foreground truncate">
              {initialData.call_id}
            </div>
          </div>

          {initialData.phone_number && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Phone Number</div>
              <div className="text-sm font-medium text-foreground">
                {initialData.phone_number}
              </div>
            </div>
          )}
        </div>

        {currentTranscript.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" />
              {isActive ? (
                <span className="text-red-500 font-medium">🔴 LIVE CONVERSATION</span>
              ) : (
                <span>Conversation Transcript</span>
              )}
            </div>
            <div className="space-y-2 bg-muted/30 rounded-lg p-3 border border-border max-h-96 overflow-y-auto">
              {currentTranscript.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "text-sm p-2 rounded transition-all",
                    msg.role === 'assistant'
                      ? "bg-primary/5 border-l-2 border-primary/20"
                      : "bg-secondary/50 border-l-2 border-secondary/20",
                    idx === currentTranscript.length - 1 && isActive && "animate-pulse"
                  )}
                >
                  <div className="font-medium text-xs text-muted-foreground mb-1">
                    {msg.role === 'assistant' ? '🤖 AI Assistant' : '👤 Caller'}
                  </div>
                  <div className="text-foreground">{msg.message}</div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        ) : isActive ? (
          <div className="text-center py-8">
            <RecoderLoader customSize={24} className="mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Waiting for conversation to start...</p>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No transcript available yet
          </div>
        )}

        {initialData.message && (
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            {initialData.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
