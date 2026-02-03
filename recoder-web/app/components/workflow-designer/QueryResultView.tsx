'use client';

import { useState, useMemo } from 'react';
import classNames from 'classnames';
import { ChevronRightIcon, ChevronDownIcon, SpinnerIcon, QueryIcon } from './icons';
import type { Generation } from './types';

// Score indicator bar
function ScoreIndicator({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s > 0.8) return 'bg-green-500';
    if (s > 0.5) return 'bg-yellow-500';
    return 'bg-bolt-elements-background-depth-3';
  };

  const getScoreTextColor = (s: number) => {
    if (s > 0.8) return 'text-green-400';
    if (s > 0.5) return 'text-yellow-400';
    return 'text-bolt-elements-textTertiary';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
        <div
          className={classNames('h-full rounded-full transition-all', getScoreColor(score))}
          style={{ width: `${score * 100}%` }}
        />
      </div>
      <span className={classNames('text-xs font-medium', getScoreTextColor(score))}>
        {score.toFixed(2)}
      </span>
    </div>
  );
}

// Content preview with expand/collapse
function ContentPreview({
  content,
  isExpanded,
  onToggle,
}: {
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const shouldShowToggle = content.length > 200;
  const displayContent =
    isExpanded || !shouldShowToggle ? content : `${content.slice(0, 200)}...`;

  return (
    <div className="space-y-2">
      <pre className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap font-mono leading-relaxed">
        {displayContent}
      </pre>
      {shouldShowToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronDownIcon className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronRightIcon className="w-3.5 h-3.5" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Data source tab
interface QueryResult {
  type: 'vector-store' | 'database';
  source: {
    provider: string;
    state: {
      status: string;
      owner?: string;
      repo?: string;
      contentType?: string;
      documentVectorStoreId?: string;
    };
  };
  records?: Array<{
    chunkIndex: number;
    chunkContent: string;
    score: number;
    metadata: Record<string, string>;
    additional?: Record<string, unknown>;
  }>;
}

function DataSourceTab({
  result,
  isActive,
  onClick,
}: {
  result: QueryResult;
  isActive: boolean;
  onClick: () => void;
}) {
  const recordCount = result.records?.length || 0;
  const provider = result.source?.provider;

  // Get display info based on provider
  let line1 = 'Data Source';
  let line2: string | undefined;

  if (provider === 'github' && result.source.state.status === 'configured') {
    line1 = `${result.source.state.owner}/${result.source.state.repo}`;
    line2 = result.source.state.contentType === 'pull_request' ? 'Pull Requests' : 'Code';
  } else if (provider === 'document' && result.source.state.status === 'configured') {
    line1 = 'Document Store';
    line2 = result.source.state.documentVectorStoreId;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex items-center gap-2 px-4 py-2 border-b-2 min-w-fit flex-shrink-0 transition-colors',
        isActive
          ? 'text-bolt-elements-textPrimary border-accent-500'
          : 'text-bolt-elements-textTertiary border-transparent hover:text-bolt-elements-textSecondary'
      )}
    >
      <QueryIcon className="w-4 h-4 flex-shrink-0" />
      <div className="flex flex-col items-start leading-tight whitespace-nowrap">
        <span className="text-sm font-medium">{line1}</span>
        {line2 && <span className="text-xs opacity-70">{line2}</span>}
      </div>
      <div
        className={classNames(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
          isActive ? 'bg-accent-500/20 text-accent-400' : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary'
        )}
      >
        {recordCount}
      </div>
    </button>
  );
}

// Query result card for individual results
function QueryResultCard({ result }: { result: QueryResult }) {
  const [expandedRecords, setExpandedRecords] = useState<Set<number>>(new Set());

  const toggleRecord = (recordIndex: number) => {
    setExpandedRecords((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(recordIndex)) {
        newExpanded.delete(recordIndex);
      } else {
        newExpanded.add(recordIndex);
      }
      return newExpanded;
    });
  };

  if (result.type !== 'vector-store') {
    return (
      <div className="bg-bolt-elements-background-depth-2/50 rounded-lg p-4 border border-bolt-elements-borderColor">
        <p className="text-bolt-elements-textTertiary text-sm">Unsupported result type: {result.type}</p>
      </div>
    );
  }

  if (!result.records || result.records.length === 0) {
    return (
      <div className="bg-bolt-elements-background-depth-2/50 rounded-lg p-4 border border-bolt-elements-borderColor text-center">
        <p className="text-bolt-elements-textTertiary text-sm">No records found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result.records.map((record, recordIndex) => (
        <div
          key={`record-${recordIndex}-${record.chunkIndex}`}
          className="bg-bolt-elements-background-depth-2/50 rounded-lg p-4 space-y-3 border border-bolt-elements-borderColor"
        >
          {/* Record header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-bolt-elements-textPrimary">
                Chunk #{record.chunkIndex}
              </span>
              {record.metadata.documentKey && (
                <span className="text-xs text-bolt-elements-textTertiary">
                  File: {record.metadata.documentKey}
                </span>
              )}
            </div>
            <ScoreIndicator score={record.score} />
          </div>

          {/* Record content */}
          <ContentPreview
            content={record.chunkContent}
            isExpanded={expandedRecords.has(recordIndex)}
            onToggle={() => toggleRecord(recordIndex)}
          />

          {/* Metadata (collapsible) */}
          {Object.keys(record.metadata).length > 0 && (
            <details className="text-xs text-bolt-elements-textTertiary">
              <summary className="cursor-pointer hover:text-bolt-elements-textSecondary">Metadata</summary>
              <div className="mt-2 pl-3 space-y-1 border-l border-bolt-elements-borderColor">
                {Object.entries(record.metadata).map(([key, value]) => {
                  if (key === 'documentVectorStoreSourceDbId') return null;
                  return (
                    <div key={key} className="flex gap-2">
                      <span className="font-medium">{key}:</span>
                      <span className="break-all">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// Loading spinner
function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 py-4">
      <SpinnerIcon className="w-5 h-5 text-accent-400" />
      <span className="text-sm text-bolt-elements-textTertiary">Loading results...</span>
    </div>
  );
}

// Main Query Result View
export function QueryResultView({ generation }: { generation: Generation }) {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Handle failed generation
  if (generation.status === 'failed') {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
        <p className="text-red-400 text-sm">{generation.error?.message}</p>
      </div>
    );
  }

  // Handle non-completed states
  if (generation.status !== 'completed' && generation.status !== 'cancelled') {
    return <LoadingSpinner />;
  }

  if (generation.status !== 'completed') {
    return null;
  }

  // Extract query results from outputs
  const queryResults = useMemo(() => {
    const results: QueryResult[] = [];
    for (const output of generation.outputs || []) {
      if (output.type === 'query-result') {
        // In a real implementation, parse the output.content
        // For now, return mock structure
        results.push({
          type: 'vector-store',
          source: {
            provider: 'document',
            state: { status: 'configured' },
          },
          records: [],
        });
      }
    }
    return results;
  }, [generation.outputs]);

  if (queryResults.length === 0) {
    return (
      <div className="p-4 bg-bolt-elements-background-depth-2/50 rounded-lg border border-bolt-elements-borderColor text-center">
        <p className="text-bolt-elements-textTertiary text-sm">No results found.</p>
      </div>
    );
  }

  const totalRecords = queryResults.reduce(
    (sum, result) => sum + (result.records?.length || 0),
    0
  );
  const activeResult = queryResults[activeTabIndex];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-2">
        <QueryIcon className="w-5 h-5 text-accent-400" />
        <p className="text-sm text-bolt-elements-textSecondary">
          Found {totalRecords} result{totalRecords !== 1 ? 's' : ''} in {queryResults.length} data
          source{queryResults.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="overflow-x-auto border-b border-bolt-elements-borderColor">
        <div className="flex gap-0 flex-nowrap">
          {queryResults.map((result, index) => (
            <DataSourceTab
              key={`datasource-${index}`}
              result={result}
              isActive={activeTabIndex === index}
              onClick={() => setActiveTabIndex(index)}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>{activeResult && <QueryResultCard result={activeResult} />}</div>
    </div>
  );
}
