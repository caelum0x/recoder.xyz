'use client';

import { useState, useEffect, useCallback } from 'react';
import { backendApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Download,
  Users,
  Loader2,
  XCircle,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserEntry {
  id: string;
  email: string | null;
  created_at: string | null;
  last_active: string | null;
  agent_count: number;
  run_count: number;
}

interface UsersData {
  users: UserEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await backendApi.get<UsersData>(
        `/admin/users/overview?${params.toString()}`,
      );
      if (res.success && res.data) {
        setUsers(res.data.users);
        setTotal(res.data.total);
      } else {
        setError(res.error?.message || 'Failed to fetch users');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [offset, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleExportCSV = useCallback(() => {
    if (users.length === 0) return;
    const headers = ['ID', 'Email', 'Joined', 'Last Active', 'Agents', 'Runs'];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = users.map((u) => [
      escape(u.id),
      escape(u.email || ''),
      escape(formatDate(u.created_at)),
      escape(formatDate(u.last_active)),
      String(u.agent_count),
      String(u.run_count),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recoder-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} total user{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border bg-card pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Loading */}
      {loading && users.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && users.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <XCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={fetchUsers}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && users.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No users found</p>
        </div>
      )}

      {/* Table */}
      {users.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Last Active
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Agents
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Runs
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <>
                    <tr
                      key={user.id}
                      className={cn(
                        'border-b last:border-0 transition-colors hover:bg-muted/30',
                        expandedId === user.id && 'bg-muted/20',
                      )}
                    >
                      <td className="px-4 py-3 font-medium">
                        {user.email || user.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(user.last_active)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {user.agent_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {user.run_count}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            setExpandedId(
                              expandedId === user.id ? null : user.id,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          {expandedId === user.id ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          View Details
                        </button>
                      </td>
                    </tr>
                    {expandedId === user.id && (
                      <tr key={`${user.id}-detail`} className="bg-muted/10">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                            <div>
                              <p className="text-muted-foreground">User ID</p>
                              <p className="font-mono mt-0.5 break-all">
                                {user.id}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Email</p>
                              <p className="mt-0.5">{user.email || '--'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Agent Count
                              </p>
                              <p className="mt-0.5 font-semibold">
                                {user.agent_count}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Total Runs
                              </p>
                              <p className="mt-0.5 font-semibold">
                                {user.run_count}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages} ({total.toLocaleString()} users)
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
