import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      contractAddress,
      sourceCode,
      chainId,
      rpcUrl,
    } = body

    // Validate that we have either contract address or source code
    if (!contractAddress && !sourceCode) {
      return NextResponse.json(
        { error: 'Either contractAddress or sourceCode is required' },
        { status: 400 }
      )
    }

    if (contractAddress && (!chainId || !rpcUrl)) {
      return NextResponse.json(
        { error: 'chainId and rpcUrl are required when scanning deployed contracts' },
        { status: 400 }
      )
    }

    // Perform security scan
    const result = await blockchainService.scanContract(
      contractAddress,
      sourceCode,
      chainId,
      rpcUrl
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Security scan error:', error)
    return NextResponse.json(
      { error: 'Failed to perform security scan', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'categories') {
      const scanner = blockchainService.getSecurityScanner()
      const categories = scanner.getVulnerabilityCategories()
      return NextResponse.json({ categories })
    }

    if (type === 'severity-info') {
      const scanner = blockchainService.getSecurityScanner()
      const severityInfo = scanner.getSeverityInfo()
      return NextResponse.json({ severityInfo })
    }

    return NextResponse.json(
      { error: 'Invalid type parameter' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Security info error:', error)
    return NextResponse.json(
      { error: 'Failed to get security info' },
      { status: 500 }
    )
  }
}export const runtime = 'nodejs';
