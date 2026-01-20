/**
 * AuditLog Component
 * Searchable audit log table with filters by action type, user, date range,
 * and export functionality for enterprise compliance.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganization } from '~/lib/hooks/useOrganization';
import type { AuditLogEntry, AuditActionType, OrganizationMember } from '~/lib/stores/organization';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface AuditLogProps {
  organizationId: string;
  onBack?: () => void;
}

// ============================================================================
// Action Type Categories
// ============================================================================

const ACTION_CATEGORIES: Record<string, AuditActionType[]> = {
  'Organization': ['org.created', 'org.updated', 'org.deleted'],
  'Members': ['member.invited', 'member.joined', 'member.removed', 'member.role_changed'],
  'Teams': ['team.created', 'team.updated', 'team.deleted', 'team.member_added', 'team.member_removed'],
  'Projects': ['project.created', 'project.transferred', 'project.deleted'],
  'Settings': ['settings.updated', 'billing.updated'],
  'API Keys': ['api_key.created', 'api_key.revoked'],
};

const ACTION_LABELS: Record<AuditActionType, string> = {
  'org.created': 'Organization Created',
  'org.updated': 'Organization Updated',
  'org.deleted': 'Organization Deleted',
  'member.invited': 'Member Invited',
  'member.joined': 'Member Joined',
  'member.removed': 'Member Removed',
  'member.role_changed': 'Member Role Changed',
  'team.created': 'Team Created',
  'team.updated': 'Team Updated',
  'team.deleted': 'Team Deleted',
  'team.member_added': 'Team Member Added',
  'team.member_removed': 'Team Member Removed',
  'project.created': 'Project Created',
  'project.transferred': 'Project Transferred',
  'project.deleted': 'Project Deleted',
  'settings.updated': 'Settings Updated',
  'billing.updated': 'Billing Updated',
  'api_key.created': 'API Key Created',
  'api_key.revoked': 'API Key Revoked',
};

const ACTION_ICONS: Record<string, string> = {
  'org': 'i-ph:buildings',
  'member': 'i-ph:user',
  'team': 'i-ph:users-three',
  'project': 'i-ph:folder',
  'settings': 'i-ph:gear',
  'billing': 'i-ph:credit-card',
  'api_key': 'i-ph:key',
};

const ACTION_COLORS: Record<string, string> = {
  'created': 'text-green-400',
  'updated': 'text-blue-400',
  'deleted': 'text-red-400',
  'invited': 'text-purple-400',
  'joined': 'text-green-400',
  'removed': 'text-red-400',
  'role_changed': 'text-orange-400',
  'transferred': 'text-blue-400',
  'revoked': 'text-red-400',
};

// ============================================================================
// Main Component
// ============================================================================

export const AuditLog = memo(({ organizationId, onBack }: AuditLogProps) => {
  const {
    organization,
    auditLog,
    auditLogHasMore,
    members,
    loading,
    loadOrganization,
    loadMembers,
    loadAuditLog,
    loadMoreAuditLog,
    exportAuditLogCsv,
  } = useOrganization();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionTypes, setSelectedActionTypes] = useState<AuditActionType[]>([]);
  const [selectedActorId, setSelectedActorId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Selected entry for detail view
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Load data on mount
  useEffect(() => {
    if (organizationId) {
      loadOrganization(organizationId);
      loadMembers();
      loadAuditLog();
    }
  }, [organizationId, loadOrganization, loadMembers, loadAuditLog]);

  // Apply filters
  const handleApplyFilters = useCallback(() => {
    loadAuditLog({
      actionType: selectedActionTypes.length === 1 ? selectedActionTypes[0] : undefined,
      actorId: selectedActorId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }, [loadAuditLog, selectedActionTypes, selectedActorId, startDate, endDate]);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSelectedActionTypes([]);
    setSelectedActorId('');
    setStartDate('');
    setEndDate('');
    loadAuditLog();
  }, [loadAuditLog]);

  // Filter entries client-side for search
  const filteredEntries = useMemo(() => {
    let entries = auditLog;

    // Text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter((entry) =>
        entry.actorName.toLowerCase().includes(query) ||
        entry.actorEmail.toLowerCase().includes(query) ||
        entry.targetName?.toLowerCase().includes(query) ||
        ACTION_LABELS[entry.action]?.toLowerCase().includes(query)
      );
    }

    // Action type filter (client-side multi-select)
    if (selectedActionTypes.length > 1) {
      entries = entries.filter((entry) => selectedActionTypes.includes(entry.action));
    }

    return entries;
  }, [auditLog, searchQuery, selectedActionTypes]);

  // Export handler
  const handleExport = useCallback(async () => {
    setExporting(true);
    const blob = await exportAuditLogCsv({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      actionTypes: selectedActionTypes.length > 0 ? selectedActionTypes : undefined,
    });
    setExporting(false);

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${organization?.slug || 'export'}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Audit log exported');
    } else {
      toast.error('Failed to export audit log');
    }
  }, [exportAuditLogCsv, startDate, endDate, selectedActionTypes, organization]);

  // Toggle action type filter
  const toggleActionType = useCallback((actionType: AuditActionType) => {
    setSelectedActionTypes((prev) =>
      prev.includes(actionType)
        ? prev.filter((t) => t !== actionType)
        : [...prev, actionType]
    );
  }, []);

  const hasActiveFilters = selectedActionTypes.length > 0 || selectedActorId || startDate || endDate;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              <span className="i-ph:arrow-left text-lg" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
              <span className="i-ph:scroll" />
              Audit Log
            </h1>
            <p className="text-sm text-bolt-elements-textTertiary mt-0.5">
              Track all organization activity for compliance and security
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || filteredEntries.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 disabled:opacity-50 text-bolt-elements-textSecondary text-sm font-medium rounded-lg transition-colors border border-bolt-elements-borderColor"
          >
            {exporting ? (
              <span className="i-ph:spinner animate-spin" />
            ) : (
              <span className="i-ph:download" />
            )}
            Export CSV
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="px-6 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <span className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by actor, target, or action..."
              className="w-full pl-10 pr-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border',
              showFilters || hasActiveFilters
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                : 'bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:border-bolt-elements-borderColorHover'
            )}
          >
            <span className="i-ph:funnel" />
            Filters
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                {[
                  selectedActionTypes.length > 0,
                  selectedActorId,
                  startDate,
                  endDate,
                ].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadAuditLog()}
            disabled={loading.auditLog}
            className="p-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
            title="Refresh"
          >
            <span className={classNames('i-ph:arrows-clockwise', loading.auditLog && 'animate-spin')} />
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Action Type Filter */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-2">
                  Action Types
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
                  {Object.entries(ACTION_CATEGORIES).map(([category, actions]) => (
                    <div key={category} className="w-full">
                      <span className="text-xs text-bolt-elements-textTertiary">{category}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {actions.map((action) => (
                          <button
                            key={action}
                            onClick={() => toggleActionType(action)}
                            className={classNames(
                              'px-2 py-1 text-xs rounded transition-colors',
                              selectedActionTypes.includes(action)
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'bg-bolt-elements-background-depth-4 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary'
                            )}
                          >
                            {ACTION_LABELS[action]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actor Filter */}
              <div>
                <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-2">
                  Actor
                </label>
                <select
                  value={selectedActorId}
                  onChange={(e) => setSelectedActorId(e.target.value)}
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All members</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-2">
                  Date Range
                </label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                    placeholder="Start date"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-bolt-elements-background-depth-4 border border-bolt-elements-borderColor rounded-lg text-sm text-bolt-elements-textPrimary focus:border-blue-500 focus:outline-none"
                    placeholder="End date"
                  />
                </div>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-bolt-elements-borderColor">
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              >
                Clear All
              </button>
              <button
                onClick={handleApplyFilters}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading.auditLog && auditLog.length === 0 ? (
            <AuditLogSkeleton />
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <span className="i-ph:scroll text-5xl text-bolt-elements-textTertiary mb-4" />
              <h2 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                No audit log entries
              </h2>
              <p className="text-sm text-bolt-elements-textTertiary max-w-md">
                {hasActiveFilters
                  ? 'No entries match your current filters. Try adjusting or clearing filters.'
                  : 'Activity will be logged here as members interact with the organization.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="mt-4 px-4 py-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead className="sticky top-0 bg-bolt-elements-background-depth-2 z-10">
                  <tr className="border-b border-bolt-elements-borderColor">
                    <th className="px-6 py-3 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bolt-elements-borderColor">
                  {filteredEntries.map((entry) => (
                    <AuditLogRow
                      key={entry.id}
                      entry={entry}
                      onClick={() => setSelectedEntry(entry)}
                      isSelected={selectedEntry?.id === entry.id}
                    />
                  ))}
                </tbody>
              </table>

              {/* Load More */}
              {auditLogHasMore && (
                <div className="p-4 flex justify-center">
                  <button
                    onClick={loadMoreAuditLog}
                    disabled={loading.auditLog}
                    className="flex items-center gap-2 px-4 py-2 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 text-bolt-elements-textSecondary text-sm rounded-lg transition-colors"
                  >
                    {loading.auditLog ? (
                      <span className="i-ph:spinner animate-spin" />
                    ) : (
                      <span className="i-ph:caret-down" />
                    )}
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail Panel */}
        {selectedEntry && (
          <div className="w-96 border-l border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 overflow-auto shrink-0">
            <AuditLogDetail
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
            />
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-6 py-2 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-bolt-elements-textTertiary">
          <span>
            Showing {filteredEntries.length} of {auditLog.length} entries
            {hasActiveFilters && ' (filtered)'}
          </span>
          <span>
            Retention: {organization?.settings.auditLogRetentionDays || 90} days
          </span>
        </div>
      </div>
    </div>
  );
});

AuditLog.displayName = 'AuditLog';

// ============================================================================
// Audit Log Row
// ============================================================================

interface AuditLogRowProps {
  entry: AuditLogEntry;
  onClick: () => void;
  isSelected: boolean;
}

const AuditLogRow = memo(({ entry, onClick, isSelected }: AuditLogRowProps) => {
  const actionPrefix = entry.action.split('.')[0];
  const actionSuffix = entry.action.split('.')[1];
  const icon = ACTION_ICONS[actionPrefix] || 'i-ph:info';
  const color = ACTION_COLORS[actionSuffix] || 'text-bolt-elements-textSecondary';

  return (
    <tr
      onClick={onClick}
      className={classNames(
        'cursor-pointer transition-colors',
        isSelected
          ? 'bg-blue-500/10'
          : 'hover:bg-bolt-elements-background-depth-2'
      )}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={classNames(icon, color, 'text-lg')} />
          <span className={classNames('text-sm', color)}>
            {ACTION_LABELS[entry.action] || entry.action}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
            {entry.actorName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm text-bolt-elements-textPrimary">{entry.actorName}</div>
            <div className="text-xs text-bolt-elements-textTertiary">{entry.actorEmail}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-bolt-elements-textSecondary">
          {entry.targetName || entry.targetId || '-'}
        </div>
        <div className="text-xs text-bolt-elements-textTertiary capitalize">
          {entry.targetType}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-bolt-elements-textSecondary">
          {formatTime(entry.timestamp)}
        </div>
        <div className="text-xs text-bolt-elements-textTertiary">
          {formatDate(entry.timestamp)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-bolt-elements-textTertiary">
        {entry.ipAddress || '-'}
      </td>
    </tr>
  );
});

AuditLogRow.displayName = 'AuditLogRow';

// ============================================================================
// Audit Log Detail
// ============================================================================

interface AuditLogDetailProps {
  entry: AuditLogEntry;
  onClose: () => void;
}

const AuditLogDetail = memo(({ entry, onClose }: AuditLogDetailProps) => {
  const actionPrefix = entry.action.split('.')[0];
  const actionSuffix = entry.action.split('.')[1];
  const icon = ACTION_ICONS[actionPrefix] || 'i-ph:info';
  const color = ACTION_COLORS[actionSuffix] || 'text-bolt-elements-textSecondary';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bolt-elements-borderColor flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
          Event Details
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary rounded"
        >
          <span className="i-ph:x" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Action */}
        <div className="flex items-center gap-3 p-3 bg-bolt-elements-background-depth-3 rounded-lg">
          <div className={classNames('w-10 h-10 rounded-lg flex items-center justify-center', color, 'bg-opacity-20')}>
            <span className={classNames(icon, 'text-xl')} />
          </div>
          <div>
            <div className={classNames('text-sm font-medium', color)}>
              {ACTION_LABELS[entry.action] || entry.action}
            </div>
            <div className="text-xs text-bolt-elements-textTertiary">
              {formatDateTime(entry.timestamp)}
            </div>
          </div>
        </div>

        {/* Actor */}
        <DetailSection title="Actor">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
              {entry.actorName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm text-bolt-elements-textPrimary">{entry.actorName}</div>
              <div className="text-xs text-bolt-elements-textTertiary">{entry.actorEmail}</div>
            </div>
          </div>
        </DetailSection>

        {/* Target */}
        <DetailSection title="Target">
          <div className="space-y-2">
            <DetailRow label="Type" value={entry.targetType} />
            {entry.targetId && <DetailRow label="ID" value={entry.targetId} mono />}
            {entry.targetName && <DetailRow label="Name" value={entry.targetName} />}
          </div>
        </DetailSection>

        {/* Request Info */}
        <DetailSection title="Request Info">
          <div className="space-y-2">
            <DetailRow label="IP Address" value={entry.ipAddress || 'Not recorded'} />
            {entry.userAgent && (
              <div>
                <span className="text-xs text-bolt-elements-textTertiary">User Agent</span>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5 break-all">
                  {entry.userAgent}
                </p>
              </div>
            )}
          </div>
        </DetailSection>

        {/* Metadata */}
        {Object.keys(entry.metadata).length > 0 && (
          <DetailSection title="Additional Data">
            <div className="bg-bolt-elements-background-depth-4 rounded-lg p-3 overflow-auto max-h-48">
              <pre className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          </DetailSection>
        )}

        {/* Event ID */}
        <DetailSection title="Event ID">
          <code className="text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-4 px-2 py-1 rounded block break-all">
            {entry.id}
          </code>
        </DetailSection>
      </div>
    </div>
  );
});

AuditLogDetail.displayName = 'AuditLogDetail';

// ============================================================================
// Helper Components
// ============================================================================

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

const DetailSection = memo(({ title, children }: DetailSectionProps) => (
  <div>
    <h4 className="text-xs font-medium text-bolt-elements-textTertiary uppercase tracking-wider mb-2">
      {title}
    </h4>
    {children}
  </div>
));

DetailSection.displayName = 'DetailSection';

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

const DetailRow = memo(({ label, value, mono }: DetailRowProps) => (
  <div className="flex items-center justify-between">
    <span className="text-xs text-bolt-elements-textTertiary">{label}</span>
    <span className={classNames(
      'text-sm text-bolt-elements-textSecondary',
      mono && 'font-mono text-xs'
    )}>
      {value}
    </span>
  </div>
));

DetailRow.displayName = 'DetailRow';

const AuditLogSkeleton = memo(() => (
  <div className="p-4">
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-2 rounded-lg animate-pulse">
          <div className="w-8 h-8 bg-bolt-elements-background-depth-3 rounded" />
          <div className="flex-1">
            <div className="h-4 bg-bolt-elements-background-depth-3 rounded w-48 mb-2" />
            <div className="h-3 bg-bolt-elements-background-depth-3 rounded w-32" />
          </div>
          <div className="h-4 bg-bolt-elements-background-depth-3 rounded w-24" />
        </div>
      ))}
    </div>
  </div>
));

AuditLogSkeleton.displayName = 'AuditLogSkeleton';

// ============================================================================
// Utility Functions
// ============================================================================

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default AuditLog;
