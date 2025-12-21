'use client'

import Link from 'next/link'
import { useCartStore } from '@/lib/store'

export default function Header() {
  const items = useCartStore((state) => state.items)
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold">
          Store
        </Link>
        <Link
          href="/cart"
          className="relative bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Cart
          {itemCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
              {itemCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
