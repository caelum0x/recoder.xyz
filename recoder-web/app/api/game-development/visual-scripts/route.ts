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
    const body = await request.json()
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/visual-scripts`, {
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
      throw new Error(error.error || 'Failed to save visual script')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Visual script save error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save visual script' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    
    // Forward to backend API
    const response = await fetch(
      `${process.env.BACKEND_URL}/api/game-development/visual-scripts?projectId=${projectId}&userId=${userId}`, 
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
        }
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch visual scripts')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Visual scripts fetch error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch visual scripts' },
      { status: 500 }
    )
  }
}