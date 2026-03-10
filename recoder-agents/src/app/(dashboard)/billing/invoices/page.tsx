'use client';

import React, { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useTransactions } from '@/hooks/billing/use-transactions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ElementType; label: string; className: string }> = {
    paid: {
      icon: CheckCircle2,
      label: 'Paid',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    failed: {
      icon: AlertCircle,
      label: 'Failed',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
  };

  const cfg = map[status] || map.pending;
  const Icon = cfg!.icon;

  return (
    <Badge variant="secondary" className={cn('text-xs font-medium gap-1', cfg!.className)}>
      <Icon className="h-3 w-3" />
      {cfg!.label}
    </Badge>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount / 100); // amounts often in cents
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: txData, isLoading } = useTransactions(100, 0);

  // Map transactions to invoice-like items (only credits/purchases)
  const invoices = useMemo(() => {
    if (!txData?.transactions) return [];

    return txData.transactions
      .filter((tx) => tx.type === 'credit' && tx.amount > 0)
      .map((tx) => ({
        id: tx.id,
        date: tx.created_at,
        description: tx.description || 'Subscription payment',
        amount: Math.abs(tx.amount) * 100, // convert to cents for display
        status: 'paid' as const,
      }));
  }, [txData]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    return invoices.filter((inv) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" disabled={filteredInvoices.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Download All
        </Button>
      </div>

      {/* Invoice Table */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No invoices yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Invoices will appear here after your first payment. Upgrade to a paid plan to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-[120px]">Amount</TableHead>
                    <TableHead className="text-center w-[100px]">Status</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(invoice.date)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          {invoice.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
