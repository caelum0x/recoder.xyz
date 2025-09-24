import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
// TODO: Add verifyAuth export to @/lib/auth or use getServerSession

export async function POST(
  request: NextRequest,
  { params }: { params: { buildId: string } }
) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const { buildId } = params
    
    if (!buildId) {
      return NextResponse.json(
        { success: false, error: 'Build ID is required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/builds/${buildId}/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to retry build')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Build retry error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to retry build' },
      { status: 500 }
    )
  }
}