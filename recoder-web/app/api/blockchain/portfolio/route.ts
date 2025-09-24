import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userAddresses } = body

    if (!userAddresses) {
      return NextResponse.json(
        { error: 'userAddresses is required' },
        { status: 400 }
      )
    }

    // Get portfolio data across all chains
    const portfolio = await blockchainService.getPortfolio(userAddresses)

    return NextResponse.json(portfolio)
  } catch (error) {
    console.error('Portfolio error:', error)
    return NextResponse.json(
      { error: 'Failed to get portfolio data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'supported-chains') {
      const supportedChains = blockchainService.getSupportedChains()
      return NextResponse.json(supportedChains)
    }

    return NextResponse.json(
      { error: 'Invalid action parameter' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Portfolio info error:', error)
    return NextResponse.json(
      { error: 'Failed to get portfolio info' },
      { status: 500 }
    )
  }
}export const runtime = 'nodejs';
