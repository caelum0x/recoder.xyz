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
    
    // Get the form data from the request
    const formData = await request.formData()
    
    // Forward the entire form data to the backend, adding userId
    const backendFormData = new FormData()
    
    // Copy all form entries
    for (const [key, value] of formData.entries()) {
      backendFormData.append(key, value)
    }
    
    // Add userId
    backendFormData.append('userId', userId)
    
    // Forward to backend API with file upload
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/assets/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
      },
      body: backendFormData
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to upload assets')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Asset upload error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to upload assets' },
      { status: 500 }
    )
  }
}