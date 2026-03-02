/**
 * EditIntentPreview Component
 * Shows a preview of files that will be affected by the user's request
 *
 * Features:
 * 1. Display target files that will be modified
 * 2. Show related context files
 * 3. Confidence indicator
 * 4. Collapsible for minimal UI footprint
 */

import { memo, useState } from 'react';
import type { EditIntent, ConfidenceLevel } from '~/lib/services/edit-intent';
import { EditType } from '~/lib/services/edit-intent';

interface EditIntentPreviewProps {
  intent: EditIntent | null;
  isAnalyzing: boolean;
  preview: {
    willModify: string[];
    mayReference: string[];
    confidence: ConfidenceLevel;
  } | null;
  error: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}

// Icons for different intent types
const IntentIcons: Record<EditType, string> = {
  [EditType.UPDATE_COMPONENT]: 'i-ph:pencil-simple',
  [EditType.ADD_FEATURE]: 'i-ph:plus-circle',
  [EditType.FIX_ISSUE]: 'i-ph:wrench',
  [EditType.REFACTOR]: 'i-ph:arrows-clockwise',
  [EditType.FULL_REBUILD]: 'i-ph:arrows-out-simple',
  [EditType.UPDATE_STYLE]: 'i-ph:paint-brush',
  [EditType.ADD_DEPENDENCY]: 'i-ph:package',
  [EditType.GENERAL_QUERY]: 'i-ph:question',
};

// Labels for intent types
const IntentLabels: Record<EditType, string> = {
  [EditType.UPDATE_COMPONENT]: 'Update',
  [EditType.ADD_FEATURE]: 'Add',
  [EditType.FIX_ISSUE]: 'Fix',
  [EditType.REFACTOR]: 'Refactor',
  [EditType.FULL_REBUILD]: 'Rebuild',
  [EditType.UPDATE_STYLE]: 'Style',
  [EditType.ADD_DEPENDENCY]: 'Install',
  [EditType.GENERAL_QUERY]: 'Question',
};

// Confidence colors
const ConfidenceColors: Record<ConfidenceLevel, string> = {
  high: 'text-green-400 bg-green-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low: 'text-recoder-elements-textTertiary bg-recoder-elements-background-depth-3',
};

export const EditIntentPreview = memo(function EditIntentPreview({
  intent,
  isAnalyzing,
  preview,
  error,
  expanded: controlledExpanded,
  onToggle,
}: EditIntentPreviewProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const handleToggle = onToggle ?? (() => setInternalExpanded(!internalExpanded));

  // Don't render if no intent and not analyzing
  if (!intent && !isAnalyzing && !error) {
    return null;
  }

  // Show loading state
  if (isAnalyzing) {
    return (
      <div className="px-3 py-2 text-xs text-recoder-elements-textTertiary flex items-center gap-2 bg-recoder-elements-background-depth-2 rounded-md border border-recoder-elements-borderColor/30">
        <div className="i-ph:spinner-gap animate-spin text-sm" />
        <span>Analyzing request...</span>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-400 flex items-center gap-2 bg-red-500/10 rounded-md border border-red-500/30">
        <div className="i-ph:warning-circle text-sm" />
        <span>{error}</span>
      </div>
    );
  }

  // No intent to show
  if (!intent || !preview) {
    return null;
  }

  // For general queries, show minimal UI
  if (intent.type === EditType.GENERAL_QUERY) {
    return (
      <div className="px-3 py-2 text-xs text-recoder-elements-textTertiary flex items-center gap-2 bg-recoder-elements-background-depth-2 rounded-md border border-recoder-elements-borderColor/30">
        <div className={`${IntentIcons[intent.type]} text-sm`} />
        <span>Question - no files will be modified</span>
      </div>
    );
  }

  const hasTargetFiles = preview.willModify.length > 0;
  const hasContextFiles = preview.mayReference.length > 0;

  return (
    <div className="bg-recoder-elements-background-depth-2 rounded-md border border-recoder-elements-borderColor/30 overflow-hidden">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-recoder-elements-background-depth-3 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Intent icon */}
          <div className={`${IntentIcons[intent.type]} text-sm text-recoder-elements-textSecondary`} />

          {/* Intent label */}
          <span className="font-medium text-recoder-elements-textPrimary">
            {IntentLabels[intent.type]}
          </span>

          {/* File count */}
          {hasTargetFiles && (
            <span className="text-recoder-elements-textSecondary">
              {preview.willModify.length} file{preview.willModify.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Confidence badge */}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ConfidenceColors[preview.confidence]}`}>
            {preview.confidence}
          </span>
        </div>

        {/* Expand/collapse icon */}
        <div className={`i-ph:caret-down text-sm text-recoder-elements-textSecondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-2 border-t border-recoder-elements-borderColor/20">
          {/* Description */}
          <p className="text-xs text-recoder-elements-textSecondary mt-2 mb-2">
            {intent.description}
          </p>

          {/* Target files */}
          {hasTargetFiles && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-recoder-elements-textTertiary mb-1">
                Will Modify
              </p>
              <div className="flex flex-wrap gap-1">
                {preview.willModify.map((file) => (
                  <FileChip key={file} file={file} type="target" />
                ))}
              </div>
            </div>
          )}

          {/* Context files */}
          {hasContextFiles && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-recoder-elements-textTertiary mb-1">
                For Context
              </p>
              <div className="flex flex-wrap gap-1">
                {preview.mayReference.slice(0, 5).map((file) => (
                  <FileChip key={file} file={file} type="context" />
                ))}
                {preview.mayReference.length > 5 && (
                  <span className="text-[10px] text-recoder-elements-textTertiary px-1">
                    +{preview.mayReference.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// File chip component
interface FileChipProps {
  file: string;
  type: 'target' | 'context';
}

const FileChip = memo(function FileChip({ file, type }: FileChipProps) {
  const fileName = file.split('/').pop() || file;
  const isTarget = type === 'target';

  // Get file icon based on extension
  const ext = fileName.split('.').pop()?.toLowerCase();
  let icon = 'i-ph:file-text';
  if (ext === 'tsx' || ext === 'jsx') icon = 'i-ph:file-jsx';
  else if (ext === 'ts' || ext === 'js') icon = 'i-ph:file-ts';
  else if (ext === 'css' || ext === 'scss') icon = 'i-ph:file-css';
  else if (ext === 'json') icon = 'i-ph:brackets-curly';
  else if (ext === 'html') icon = 'i-ph:file-html';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
        isTarget
          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
          : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary border border-recoder-elements-borderColor'
      }`}
      title={file}
    >
      <span className={`${icon} text-[10px]`} />
      <span className="max-w-[120px] truncate">{fileName}</span>
    </span>
  );
});
