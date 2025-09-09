import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 192,
  height: 192,
}
export const contentType = 'image/png'

export default function Icon192() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 50%, #7c3aed 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            borderRadius: '32px',
            fontSize: 96,
            fontWeight: 'bold',
            fontFamily: 'system-ui',
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
            border: '4px solid rgba(255, 255, 255, 0.2)',
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
              textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '-2px'
            }}>
              R
            </span>
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '-12px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(45deg, #10b981, #059669)',
                border: '2px solid white',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
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
    console.error('Error generating 192px icon:', error);
    return new Response('Error generating icon', { status: 500 });
  }
}