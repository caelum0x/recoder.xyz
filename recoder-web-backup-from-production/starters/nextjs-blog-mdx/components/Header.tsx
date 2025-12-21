import Link from 'next/link'
import { getAllCategories } from '@/lib/posts'

export default function Header() {
  const categories = getAllCategories()

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <Link href="/" className="text-2xl font-bold">
            My Blog
          </Link>
          <nav className="flex gap-6">
            <Link href="/" className="hover:text-blue-600 transition">
              Home
            </Link>
            <Link href="/about" className="hover:text-blue-600 transition">
              About
            </Link>
          </nav>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {categories.map((category) => (
              <Link
                key={category}
                href={`/category/${category}`}
                className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition"
              >
                {category}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
