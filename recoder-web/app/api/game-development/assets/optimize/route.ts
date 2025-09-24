import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
// TODO: Add verifyAuth export to @/lib/auth or use getServerSession

export async function POST(request: NextRequest) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    
    // Get the optimization data from the request
    const body = await request.json()
    const { assetId, optimizations } = body
    
    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Asset ID is required' },
        { status: 400 }
      )
    }
    
    if (!optimizations || !Array.isArray(optimizations) || optimizations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Optimizations are required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/assets/${assetId}/optimize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        optimizations,
        userId
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to optimize asset')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Asset optimization error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to optimize asset' },
      { status: 500 }
    )
  }
}