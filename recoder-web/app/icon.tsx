import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

export default function Icon() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 24,
            background: 'linear-gradient(90deg, #3b82f6 0%, #1e40af 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            borderRadius: '6px',
          }}
        >
          R
        </div>
      ),
      {
        ...size,
      }
    )
  } catch (error) {
    console.error('Error generating icon:', error);
    // Return a simple response if ImageResponse fails
    return new Response('Error generating icon', { status: 500 });
  }
}