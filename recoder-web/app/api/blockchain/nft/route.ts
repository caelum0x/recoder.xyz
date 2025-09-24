import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const blockchain = formData.get('blockchain') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const imageFile = formData.get('image') as File
    const userAddress = formData.get('userAddress') as string
    const contractAddress = formData.get('contractAddress') as string
    const attributes = formData.get('attributes') as string
    const chainId = formData.get('chainId') as string
    const network = formData.get('network') as string

    // Validate required fields
    if (!blockchain || !name || !description || !imageFile || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Parse attributes if provided
    let parsedAttributes = []
    if (attributes) {
      try {
        parsedAttributes = JSON.parse(attributes)
      } catch (error) {
        console.error('Failed to parse attributes:', error)
      }
    }

    const nftData = {
      name,
      description,
      imageFile,
      userAddress,
      contractAddress,
      attributes: parsedAttributes,
    }

    const networkConfig = {
      chainId: chainId ? parseInt(chainId) : undefined,
      network: network as 'devnet' | 'testnet' | 'mainnet' | undefined,
    }

    // Mint the NFT
    const result = await blockchainService.mintNFT(
      blockchain as any,
      nftData,
      networkConfig
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('NFT minting error:', error)
    return NextResponse.json(
      { error: 'Failed to mint NFT', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const blockchain = searchParams.get('blockchain')
    const contractAddress = searchParams.get('contractAddress')
    const tokenId = searchParams.get('tokenId')
    const network = searchParams.get('network')

    if (!blockchain || !contractAddress || !tokenId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Get NFT metadata
    if (blockchain === 'solana') {
      const service = blockchainService.getService('solana') as any
      const metadata = await service.getNFTMetadata(network || 'mainnet', contractAddress)
      return NextResponse.json(metadata)
    }

    if (blockchain === 'near') {
      const service = blockchainService.getService('near') as any
      const metadata = await service.getNFTMetadata(
        network || 'mainnet',
        contractAddress,
        tokenId
      )
      return NextResponse.json(metadata)
    }

    // For EVM chains, we'd implement ERC-721 metadata reading
    return NextResponse.json({
      message: 'NFT metadata reading not implemented for this blockchain',
    })
  } catch (error) {
    console.error('NFT metadata error:', error)
    return NextResponse.json(
      { error: 'Failed to get NFT metadata' },
      { status: 500 }
    )
  }
}export const runtime = 'nodejs';
