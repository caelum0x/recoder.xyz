import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 512,
  height: 512,
}
export const contentType = 'image/png'

export default function Icon512() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 40%, #7c3aed 80%, #ec4899 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            borderRadius: '80px',
            fontSize: 280,
            fontWeight: 'bold',
            fontFamily: 'system-ui',
            boxShadow: '0 20px 64px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            border: '8px solid rgba(255, 255, 255, 0.15)',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span style={{ 
              textShadow: '0 8px 16px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '-8px',
              background: 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              R
            </span>
            {/* AI indicator dot */}
            <div
              style={{
                position: 'absolute',
                top: '20px',
                right: '-32px',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(45deg, #10b981, #059669)',
                border: '6px solid white',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'white',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            </div>
            {/* Subtle tech pattern */}
            <div
              style={{
                position: 'absolute',
                top: '-100px',
                left: '-100px',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                opacity: 0.6,
                transform: 'rotate(45deg)',
              }}
            />
          </div>
        </div>
      ),
      {
        ...size,
      }
    )
  } catch (error) {
    console.error('Error generating 512px icon:', error);
    return new Response('Error generating icon', { status: 500 });
  }
}