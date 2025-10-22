'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { 
  FileText, 
  Download, 
  Eye, 
  Calendar, 
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  Filter
} from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'cancelled';
  description: string;
  pdfUrl?: string;
}

export default function InvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadInvoices();
    }
  }, [status, router]);

  const loadInvoices = async () => {
    try {
      const response = await fetch('/api/billing/invoices');
      const data = await response.json();
      if (data.success) {
        setInvoices(data.invoices);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadInvoice = async (invoiceId: string) => {
    setDownloadingId(invoiceId);
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500/10 text-green-500 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
      case 'failed':
      case 'cancelled':
        return 'bg-red-500/10 text-red-500 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || invoice.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/billing" 
            className="text-gray-400 hover:text-white mb-4 inline-flex items-center gap-2 transition-colors"
          >
            ← Back to Billing
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Invoices
          </h1>
          <p className="text-gray-400">View and download your billing history</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-orange-500 to-purple-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-gray-400 text-sm">Total Invoices</span>
            </div>
            <p className="text-3xl font-bold">{invoices.length}</p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <span className="text-gray-400 text-sm">Paid Invoices</span>
            </div>
            <p className="text-3xl font-bold">
              {invoices.filter(inv => inv.status === 'paid').length}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-500" />
              </div>
              <span className="text-gray-400 text-sm">Total Paid</span>
            </div>
            <p className="text-3xl font-bold">${totalPaid.toFixed(2)}</p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="appearance-none bg-black/50 border border-white/10 rounded-lg pl-10 pr-10 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Invoices List */}
        {filteredInvoices.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Invoices Found</h3>
            <p className="text-gray-400 mb-6">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'You don\'t have any invoices yet'}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              >
                View Plans
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-orange-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-orange-500" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold">
                          Invoice #{invoice.invoiceNumber}
                        </h3>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                          {getStatusIcon(invoice.status)}
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </div>
                      
                      <p className="text-gray-400 text-sm mb-3">{invoice.description}</p>
                      
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Calendar className="w-4 h-4" />
                          {new Date(invoice.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                          <DollarSign className="w-4 h-4" />
                          {invoice.currency} {invoice.amount.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/billing/invoices/${invoice.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                    
                    <button
                      onClick={() => downloadInvoice(invoice.id)}
                      disabled={downloadingId === invoice.id}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 hover:opacity-90 rounded-lg transition-opacity text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadingId === invoice.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Download All Button */}
        {filteredInvoices.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={() => {/* Implement bulk download */}}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all font-medium"
            >
              <Download className="w-5 h-5" />
              Download All as ZIP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
