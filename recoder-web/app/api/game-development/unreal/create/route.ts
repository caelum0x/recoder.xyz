import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await verifyAuth(request)
    const body = await request.json()
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/unreal/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      },
      body: JSON.stringify({
        ...body,
        userId
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create Unreal Engine project')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Unreal Engine project creation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create Unreal Engine project' },
      { status: 500 }
    )
  }
}