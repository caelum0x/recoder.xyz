import { getAllPosts } from '@/lib/posts'
import PostCard from '@/components/PostCard'

export default function Home() {
  const posts = getAllPosts()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-bold mb-4">Welcome to My Blog</h1>
        <p className="text-xl text-gray-600">
          Thoughts, tutorials, and insights about web development
        </p>
      </div>

      <div className="space-y-8">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No posts yet. Create your first post in <code>content/posts/</code></p>
        </div>
      )}
    </div>
  )
}
