import { getAllCategories, getPostsByCategory } from '@/lib/posts'
import PostCard from '@/components/PostCard'

export async function generateStaticParams() {
  const categories = getAllCategories()
  return categories.map((category) => ({
    name: category,
  }))
}

export default function CategoryPage({ params }: { params: { name: string } }) {
  const posts = getPostsByCategory(params.name)

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-5xl font-bold mb-4 capitalize">{params.name}</h1>
        <p className="text-xl text-gray-600">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'} in this category
        </p>
      </div>

      <div className="space-y-8">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  )
}
