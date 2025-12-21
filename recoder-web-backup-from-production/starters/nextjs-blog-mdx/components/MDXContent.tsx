'use client'

import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote'

interface MDXContentProps {
  source: MDXRemoteSerializeResult
}

const components = {
  h1: (props: any) => <h1 className="text-4xl font-bold mt-8 mb-4" {...props} />,
  h2: (props: any) => <h2 className="text-3xl font-bold mt-8 mb-4" {...props} />,
  h3: (props: any) => <h3 className="text-2xl font-semibold mt-6 mb-3" {...props} />,
  p: (props: any) => <p className="mb-4 leading-7" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-6 mb-4" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-6 mb-4" {...props} />,
  li: (props: any) => <li className="mb-2" {...props} />,
  a: (props: any) => <a className="text-blue-600 hover:underline" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="border-l-4 border-blue-500 pl-4 italic my-6 text-gray-700" {...props} />
  ),
  code: (props: any) => <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm" {...props} />,
  pre: (props: any) => <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto my-6" {...props} />,
}

export default function MDXContent({ source }: MDXContentProps) {
  return (
    <div className="prose prose-lg max-w-none">
      <MDXRemote {...source} components={components} />
    </div>
  )
}
