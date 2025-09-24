import { NextRequest, NextResponse } from 'next/server'
import { blockchainService } from '@/lib/blockchain'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    const ipfsService = blockchainService.getIPFSService()
    
    let result
    if (type === 'json') {
      // If it's JSON data, parse the file content
      const text = await file.text()
      const jsonData = JSON.parse(text)
      result = await ipfsService.uploadJSON(jsonData)
    } else {
      // Upload as file
      result = await ipfsService.uploadFile(file)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('IPFS upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload to IPFS', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cid = searchParams.get('cid')
    const action = searchParams.get('action')

    const ipfsService = blockchainService.getIPFSService()

    if (action === 'download' && cid) {
      const data = await ipfsService.downloadFile(cid)
      return new NextResponse(data instanceof Uint8Array ? Buffer.from(data) : data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${cid}"`,
        },
      })
    }

    if (action === 'download-json' && cid) {
      const data = await ipfsService.downloadJSON(cid)
      return NextResponse.json(data)
    }

    if (action === 'stats' && cid) {
      const stats = await ipfsService.getFileStats(cid)
      return NextResponse.json(stats)
    }

    if (action === 'pinned') {
      const pinnedFiles = await ipfsService.listPinnedFiles()
      return NextResponse.json({ pinnedFiles })
    }

    if (action === 'node-info') {
      const nodeInfo = await ipfsService.getNodeInfo()
      return NextResponse.json(nodeInfo)
    }

    if (action === 'test-connection') {
      const isConnected = await ipfsService.testConnection()
      return NextResponse.json({ connected: isConnected })
    }

    return NextResponse.json(
      { error: 'Invalid action or missing parameters' },
      { status: 400 }
    )
  } catch (error) {
    console.error('IPFS operation error:', error)
    return NextResponse.json(
      { error: 'Failed to perform IPFS operation', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { cid, action } = body

    if (!cid) {
      return NextResponse.json(
        { error: 'CID is required' },
        { status: 400 }
      )
    }

    const ipfsService = blockchainService.getIPFSService()

    if (action === 'pin') {
      await ipfsService.pinFile(cid)
      return NextResponse.json({ success: true, message: 'File pinned successfully' })
    }

    if (action === 'unpin') {
      await ipfsService.unpinFile(cid)
      return NextResponse.json({ success: true, message: 'File unpinned successfully' })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('IPFS pin/unpin error:', error)
    return NextResponse.json(
      { error: 'Failed to pin/unpin file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}export const runtime = 'nodejs';
