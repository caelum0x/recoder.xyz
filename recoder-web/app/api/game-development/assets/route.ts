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
    const { searchParams } = new URL(request.url)
    
    const projectId = searchParams.get('projectId')
    const type = searchParams.get('type')
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const page = searchParams.get('page') || '1'
    const limit = searchParams.get('limit') || '20'
    
    const params = new URLSearchParams()
    params.append('userId', userId)
    if (projectId) params.append('projectId', projectId)
    if (type) params.append('type', type)
    if (search) params.append('search', search)
    if (category) params.append('category', category)
    params.append('page', page)
    params.append('limit', limit)
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/assets?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch assets')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Assets fetch error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch assets' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // TODO: Replace with proper auth verification
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get('id')
    
    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Asset ID is required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/assets/${assetId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      },
      body: JSON.stringify({ userId })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete asset')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Asset deletion error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete asset' },
      { status: 500 }
    )
  }
}