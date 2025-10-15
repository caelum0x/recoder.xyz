'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/ui/LoadingSpinner';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Star,
  CheckCircle,
  Calendar,
  Shield,
  AlertCircle
} from 'lucide-react';

interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank';
  brand?: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  holderName: string;
}

export default function PaymentMethodsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      loadPaymentMethods();
    }
  }, [status, router]);

  const loadPaymentMethods = async () => {
    try {
      const response = await fetch('/api/billing/payment-methods');
      const data = await response.json();
      if (data.success) {
        setPaymentMethods(data.methods);
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);

    try {
      const response = await fetch('/api/billing/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardNumber,
          cardName,
          expiryMonth: parseInt(expiryMonth),
          expiryYear: parseInt(expiryYear),
          cvv,
          setAsDefault,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadPaymentMethods();
        setShowAddModal(false);
        resetForm();
      } else {
        alert(data.error || 'Failed to add payment method');
      }
    } catch (error) {
      console.error('Error adding payment method:', error);
      alert('Failed to add payment method');
    } finally {
      setProcessing(false);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    try {
      const response = await fetch('/api/billing/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ methodId, setAsDefault: true }),
      });

      if (response.ok) {
        await loadPaymentMethods();
      }
    } catch (error) {
      console.error('Error setting default payment method:', error);
    }
  };

  const handleDelete = async (methodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return;
    }

    setDeletingId(methodId);
    try {
      const response = await fetch(`/api/billing/payment-methods?methodId=${methodId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadPaymentMethods();
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setCardNumber('');
    setCardName('');
    setExpiryMonth('');
    setExpiryYear('');
    setCvv('');
    setSetAsDefault(true);
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const formatted = cleaned.replace(/(\d{4})/g, '$1 ').trim();
    return formatted;
  };

  const getCardIcon = (brand?: string) => {
    // In a real app, you'd have actual brand logos
    return <CreditCard className="w-8 h-8" />;
  };

  if (loading || status === 'loading') {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/billing" 
            className="text-gray-400 hover:text-white mb-4 inline-flex items-center gap-2 transition-colors"
          >
            ← Back to Billing
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-2">
            Payment Methods
          </h1>
          <p className="text-gray-400">Manage your payment methods for subscriptions</p>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-400 mb-1">Secure Payment Processing</h3>
              <p className="text-sm text-gray-300">
                All payment information is encrypted and securely stored. We use industry-standard security measures to protect your data.
              </p>
            </div>
          </div>
        </div>

        {/* Payment Methods List */}
        {paymentMethods.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center mb-8">
            <CreditCard className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Payment Methods</h3>
            <p className="text-gray-400 mb-6">
              Add a payment method to manage your subscriptions
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-5 h-5" />
              Add Payment Method
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Your Payment Methods</h2>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition-opacity text-sm"
              >
                <Plus className="w-4 h-4" />
                Add New
              </button>
            </div>

            <div className="space-y-4 mb-8">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-orange-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center">
                        {getCardIcon(method.brand)}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">
                            {method.brand || 'Card'} •••• {method.last4}
                          </h3>
                          {method.isDefault && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/30">
                              <Star className="w-3 h-3 fill-current" />
                              Default
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                          <span>{method.holderName}</span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            Expires {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!method.isDefault && (
                        <button
                          onClick={() => handleSetDefault(method.id)}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-sm font-medium"
                        >
                          Set as Default
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDelete(method.id)}
                        disabled={deletingId === method.id || method.isDefault}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-all text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={method.isDefault ? 'Cannot delete default payment method' : 'Delete'}
                      >
                        {deletingId === method.id ? (
                          <div className="w-5 h-5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add Payment Method Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6">Add Payment Method</h2>
              
              <form onSubmit={handleAddPaymentMethod} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="John Doe"
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={formatCardNumber(cardNumber)}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, ''))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Month
                    </label>
                    <input
                      type="text"
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(e.target.value)}
                      placeholder="MM"
                      maxLength={2}
                      required
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Year
                    </label>
                    <input
                      type="text"
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(e.target.value)}
                      placeholder="YY"
                      maxLength={2}
                      required
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      CVV
                    </label>
                    <input
                      type="text"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="123"
                      maxLength={4}
                      required
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    className="w-5 h-5 rounded border-white/10 bg-black/50 text-orange-500 focus:ring-2 focus:ring-orange-500/50"
                  />
                  <span className="text-sm">Set as default payment method</span>
                </label>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:opacity-90 rounded-lg font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Adding...' : 'Add Card'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
