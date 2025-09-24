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
    
    // Get the build data from the request
    const body = await request.json()
    const {
      projectId,
      platforms,
      buildType,
      configuration,
      version,
      buildSettings,
      priority
    } = body
    
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      )
    }
    
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one platform is required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/builds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId,
        platforms,
        buildType,
        configuration,
        version,
        buildSettings,
        priority,
        userId
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create build jobs')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Build creation error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create build jobs' },
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
    const status = searchParams.get('status')
    const platform = searchParams.get('platform')
    const page = searchParams.get('page') || '1'
    const limit = searchParams.get('limit') || '20'
    
    const params = new URLSearchParams()
    params.append('userId', userId)
    if (projectId) params.append('projectId', projectId)
    if (status) params.append('status', status)
    if (platform) params.append('platform', platform)
    params.append('page', page)
    params.append('limit', limit)
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/builds?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch builds')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Builds fetch error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch builds' },
      { status: 500 }
    )
  }
}