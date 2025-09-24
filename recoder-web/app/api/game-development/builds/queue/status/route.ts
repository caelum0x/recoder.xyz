import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
// TODO: Add verifyAuth export to @/lib/auth or use getServerSession

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/builds/queue/status?userId=${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get build queue status')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Build queue status error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get build queue status' },
      { status: 500 }
    )
  }
}