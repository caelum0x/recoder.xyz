import Link from 'next/link'
import { format } from 'date-fns'
import type { Post } from '@/lib/posts'

export default function PostCard({ post }: { post: Post }) {
  return (
    <article className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
      <Link href={`/blog/${post.slug}`}>
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
          <time dateTime={post.date}>
            {format(new Date(post.date), 'MMMM d, yyyy')}
          </time>
          <span>•</span>
          <span>{post.readingTime}</span>
          <span>•</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
            {post.category}
          </span>
        </div>

        <h2 className="text-2xl font-bold mb-3 hover:text-blue-600 transition">
          {post.title}
        </h2>

        <p className="text-gray-600 mb-4 line-clamp-2">
          {post.excerpt}
        </p>

        {post.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </article>
  )
}
