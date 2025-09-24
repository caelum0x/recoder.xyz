import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      blockchain,
      contractData,
      networkConfig,
    } = body

    // Validate required fields
    if (!blockchain || !contractData || !networkConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: blockchain, contractData, networkConfig' },
        { status: 400 }
      )
    }

    // Deploy the contract
    const result = await blockchainService.deployContract(
      blockchain,
      contractData,
      networkConfig
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Contract deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to deploy contract', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blockchain = searchParams.get('blockchain')
    const contractAddress = searchParams.get('contractAddress')
    const chainId = searchParams.get('chainId')

    if (!blockchain || !contractAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Get contract information
    const service = blockchainService.getService(blockchain as any)
    
    if (blockchain === 'evm' && chainId) {
      const provider = (service as any).getProvider(parseInt(chainId))
      const code = await provider.getCode(contractAddress)
      
      return NextResponse.json({
        address: contractAddress,
        hasCode: code !== '0x',
        bytecode: code,
      })
    }

    return NextResponse.json({
      address: contractAddress,
      blockchain,
    })
  } catch (error) {
    console.error('Contract info error:', error)
    return NextResponse.json(
      { error: 'Failed to get contract info' },
      { status: 500 }
    )
  }
}

export const runtime = 'nodejs';
