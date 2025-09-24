import { verifyAuth } from '@/lib/auth/index'
import { NextRequest, NextResponse } from 'next/server'
//import { verifyAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await verifyAuth(request)
    
    // Get the batch processing data from the request
    const body = await request.json()
    const { assetIds, operations } = body
    
    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Asset IDs are required' },
        { status: 400 }
      )
    }
    
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Operations are required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${process.env.BACKEND_URL}/api/game-development/assets/batch-process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assetIds,
        operations,
        userId
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to process assets')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Batch asset processing error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process assets' },
      { status: 500 }
    )
  }
}