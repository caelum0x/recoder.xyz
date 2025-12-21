'use client'

import Image from 'next/image'
import { useCartStore } from '@/lib/store'
import type { Product } from '@/lib/products'

export default function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((state) => state.addItem)

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-48 object-cover"
      />
      <div className="p-4">
        <h3 className="text-xl font-semibold mb-2">{product.name}</h3>
        <p className="text-gray-600 mb-4">{product.description}</p>
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold">
            ${(product.price / 100).toFixed(2)}
          </span>
          <button
            onClick={() => addItem(product)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
