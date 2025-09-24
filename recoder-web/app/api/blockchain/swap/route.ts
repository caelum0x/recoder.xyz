import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      blockchain,
      swapData,
      networkConfig,
    } = body

    // Validate required fields
    if (!blockchain || !swapData || !networkConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: blockchain, swapData, networkConfig' },
        { status: 400 }
      )
    }

    // Execute the swap
    const result = await blockchainService.swapTokens(
      blockchain,
      swapData,
      networkConfig
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Token swap error:', error)
    return NextResponse.json(
      { error: 'Failed to execute swap', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blockchain = searchParams.get('blockchain')
    const tokenIn = searchParams.get('tokenIn')
    const tokenOut = searchParams.get('tokenOut')
    const amount = searchParams.get('amount')
    const network = searchParams.get('network')

    if (!blockchain || !tokenIn || !tokenOut || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Get swap quote
    if (blockchain === 'solana') {
      const service = blockchainService.getService('solana') as any
      const quote = await service.getJupiterQuote(
        tokenIn,
        tokenOut,
        parseInt(amount),
        50 // 0.5% slippage
      )
      
      return NextResponse.json({
        inputAmount: amount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
        route: quote.routePlan,
      })
    }

    // For EVM chains, we'd implement Uniswap quote logic here
    return NextResponse.json({
      message: 'Quote functionality not implemented for this blockchain',
    })
  } catch (error) {
    console.error('Swap quote error:', error)
    return NextResponse.json(
      { error: 'Failed to get swap quote' },
      { status: 500 }
    )
  }
}export const runtime = 'nodejs';
