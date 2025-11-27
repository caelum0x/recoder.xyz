'use client';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Must use lowercase html/body tags in app router
  return (
    <html lang="en">
      <body style={{ padding: '20px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2>Something went wrong!</h2>
        <p>An unexpected error occurred.</p>
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
