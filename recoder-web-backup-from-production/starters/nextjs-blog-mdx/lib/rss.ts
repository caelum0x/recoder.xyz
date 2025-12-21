import RSS from 'rss'
import { getAllPosts } from './posts'

export function generateRSSFeed() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourblog.com'

  const feed = new RSS({
    title: 'My Blog',
    description: 'A blog about web development, coding, and technology',
    site_url: siteUrl,
    feed_url: `${siteUrl}/feed.xml`,
    language: 'en',
    pubDate: new Date(),
  })

  const posts = getAllPosts()

  posts.forEach((post) => {
    feed.item({
      title: post.title,
      description: post.excerpt,
      url: `${siteUrl}/blog/${post.slug}`,
      date: post.date,
      author: post.author,
      categories: [post.category, ...post.tags],
    })
  })

  return feed.xml({ indent: true })
}
