/**
 * Browser-safe cost calculation utilities
 */

export function parseApiPrice(priceStr: string | null | undefined): number {
  if (!priceStr || typeof priceStr !== 'string') {
    return 0;
  }
  
  // Remove currency symbols and non-numeric characters except dots and dashes
  const cleanStr = priceStr.replace(/[^0-9.-]/g, '');
  const price = parseFloat(cleanStr);
  
  return isNaN(price) ? 0 : price;
}

export function calculateTokenCost(tokens: number, pricePerToken: number): number {
  return tokens * pricePerToken;
}

export function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(price);
}