import Link from "next/link";

// Force dynamic rendering to avoid SSR issues with auth context
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 text-gray-900 antialiased">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <h2 className="mt-4 text-3xl font-semibold text-gray-800">Page Not Found</h2>
        <p className="mt-2 text-gray-600">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <div className="mt-8 space-x-4">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-gray-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
