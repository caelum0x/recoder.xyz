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
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: 'var(--color-zinc-950, #0a0a0a)',
        color: 'var(--color-zinc-50, #fafafa)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}>
          <img src="/logo.png" alt="Recoder" width={48} height={48} style={{ marginBottom: '24px' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--color-zinc-400, #a1a1aa)', marginBottom: '24px' }}>
            A critical error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--color-orange-500, #f97316)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '14px',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
