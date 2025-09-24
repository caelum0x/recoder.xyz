// Mock IPFS implementation to avoid missing dependencies
// Real implementation would use 'helia' and '@helia/unixfs'
import { ipfsConfig } from './config'

// Mock IPFS interface
interface MockIPFSNode {
  add: (data: any) => Promise<{ cid: string }>;
  addBytes: (data: Uint8Array) => Promise<{ cid: string }>;
  addAll: (files: any[]) => AsyncIterableIterator<{ cid: string; path: string }>;
  cat: (cid: string) => AsyncIterableIterator<Uint8Array>;
  pin: (cid: string) => Promise<void>;
  stat: (cid: string) => Promise<{ size: number }>;
}

export class IPFSService {
  private helia: any = null
  private fs: MockIPFSNode | null = null

  constructor() {
    this.initialize()
  }

  private async initialize() {
    try {
      // Mock IPFS implementation
      this.fs = {
        add: async (data: any) => ({ cid: 'mock_' + Date.now() }),
        addBytes: async (data: Uint8Array) => ({ cid: 'mock_' + Date.now() }),
        addAll: async function* (files: any[]) {
          for (const file of files) {
            yield { cid: 'mock_' + Date.now(), path: file.path || 'file' };
          }
        },
        cat: async function* (cid: string) {
          yield new Uint8Array([]);
        },
        pin: async (cid: string) => {},
        stat: async (cid: string) => ({ size: 1024 })
      }
    } catch (error) {
      console.error('Failed to initialize IPFS:', error)
    }
  }

  async uploadFile(file: File | Buffer | Uint8Array): Promise<{ cid: string; url: string }> {
    if (!this.fs) {
      await this.initialize()
    }
    
    if (!this.fs) {
      throw new Error('IPFS service not initialized')
    }

    try {
      let data: Uint8Array

      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer()
        data = new Uint8Array(arrayBuffer)
      } else if (Buffer.isBuffer(file)) {
        data = new Uint8Array(file)
      } else {
        data = file
      }

      const result = await this.fs.addBytes(data)
      const cidString = result.cid

      return {
        cid: cidString,
        url: `${ipfsConfig.gateways[0]}${cidString}`,
      }
    } catch (error) {
      console.error('Failed to upload file to IPFS:', error)
      throw new Error('Failed to upload file to IPFS')
    }
  }

  async uploadJSON(data: any): Promise<{ cid: string; url: string }> {
    const jsonString = JSON.stringify(data)
    const jsonData = new TextEncoder().encode(jsonString)
    return await this.uploadFile(jsonData)
  }

  async uploadDirectory(files: { path: string; content: File | Buffer | Uint8Array }[]): Promise<{ cid: string; url: string }> {
    if (!this.fs) {
      await this.initialize()
    }
    
    if (!this.fs) {
      throw new Error('IPFS service not initialized')
    }

    try {
      const entries: any[] = []

      for (const file of files) {
        let data: Uint8Array

        if (file.content instanceof File) {
          const arrayBuffer = await file.content.arrayBuffer()
          data = new Uint8Array(arrayBuffer)
        } else if (Buffer.isBuffer(file.content)) {
          data = new Uint8Array(file.content)
        } else {
          data = file.content
        }

        entries.push({
          path: file.path,
          content: data,
        })
      }

      let cidString = 'mock_directory_' + Date.now()
      for await (const result of this.fs.addAll(entries)) {
        cidString = result.cid
      }

      return {
        cid: cidString,
        url: `${ipfsConfig.gateways[0]}${cidString}`,
      }
    } catch (error) {
      console.error('Failed to upload directory to IPFS:', error)
      throw new Error('Failed to upload directory to IPFS')
    }
  }

  async downloadFile(cid: string): Promise<Uint8Array> {
    if (!this.fs) {
      await this.initialize()
    }
    
    if (!this.fs) {
      throw new Error('IPFS service not initialized')
    }

    try {
      const chunks: Uint8Array[] = []
      
      for await (const chunk of this.fs.cat(cid)) {
        chunks.push(chunk)
      }

      // Concatenate all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      return result
    } catch (error) {
      console.error('Failed to download file from IPFS:', error)
      throw new Error('Failed to download file from IPFS')
    }
  }

  async downloadJSON(cid: string): Promise<any> {
    const data = await this.downloadFile(cid)
    const jsonString = new TextDecoder().decode(data)
    return JSON.parse(jsonString)
  }

  async pinFile(cid: string): Promise<void> {
    if (!this.helia) {
      await this.initialize()
    }

    try {
      await this.helia.pins.add(cid)
    } catch (error) {
      console.error('Failed to pin file:', error)
      throw new Error('Failed to pin file')
    }
  }

  async unpinFile(cid: string): Promise<void> {
    if (!this.helia) {
      await this.initialize()
    }

    try {
      await this.helia.pins.rm(cid)
    } catch (error) {
      console.error('Failed to unpin file:', error)
      throw new Error('Failed to unpin file')
    }
  }

  async listPinnedFiles(): Promise<string[]> {
    if (!this.helia) {
      await this.initialize()
    }

    try {
      const pins: string[] = []
      for await (const pin of this.helia.pins.ls()) {
        pins.push(pin.toString())
      }
      return pins
    } catch (error) {
      console.error('Failed to list pinned files:', error)
      throw new Error('Failed to list pinned files')
    }
  }

  async getFileStats(cid: string): Promise<{ size: number; type: string }> {
    if (!this.fs) {
      await this.initialize()
    }
    
    if (!this.fs) {
      throw new Error('IPFS service not initialized')
    }

    try {
      const stats = await this.fs.stat(cid)
      return {
        size: stats.size,
        type: 'file', // Mock type since not available in mock stats
      }
    } catch (error) {
      console.error('Failed to get file stats:', error)
      throw new Error('Failed to get file stats')
    }
  }

  // NFT metadata helpers
  async uploadNFTMetadata(metadata: {
    name: string
    description: string
    image: string
    attributes?: Array<{ trait_type: string; value: string | number }>
    external_url?: string
    animation_url?: string
  }): Promise<{ cid: string; url: string }> {
    const nftMetadata = {
      ...metadata,
      image: metadata.image.startsWith('ipfs://') ? metadata.image : `ipfs://${metadata.image}`,
    }

    return await this.uploadJSON(nftMetadata)
  }

  async uploadNFTImage(imageFile: File): Promise<{ cid: string; url: string; ipfsUrl: string }> {
    const result = await this.uploadFile(imageFile)
    return {
      ...result,
      ipfsUrl: `ipfs://${result.cid}`,
    }
  }

  async uploadNFTCollection(
    collectionMetadata: {
      name: string
      description: string
      image: File | Buffer | Uint8Array
      external_link?: string
    },
    nfts: Array<{
      name: string
      description: string
      imageFile: File
      attributes?: Array<{ trait_type: string; value: string | number }>
    }>
  ): Promise<{
    collectionCid: string
    collectionUrl: string
    nftMetadata: Array<{ cid: string; url: string; tokenId: number }>
  }> {
    // Upload collection image
    const collectionImageResult = await this.uploadFile(collectionMetadata.image)
    
    // Upload collection metadata
    const collectionData = {
      ...collectionMetadata,
      image: `ipfs://${collectionImageResult.cid}`,
    }
    const collectionResult = await this.uploadJSON(collectionData)

    // Upload individual NFTs
    const nftResults = []
    for (let i = 0; i < nfts.length; i++) {
      const nft = nfts[i]
      
      // Upload NFT image
      const imageResult = await this.uploadFile(nft.imageFile)
      
      // Create NFT metadata
      const nftMetadata = {
        name: nft.name,
        description: nft.description,
        image: `ipfs://${imageResult.cid}`,
        attributes: nft.attributes || [],
        external_url: collectionMetadata.external_link,
      }
      
      // Upload NFT metadata
      const metadataResult = await this.uploadJSON(nftMetadata)
      
      nftResults.push({
        cid: metadataResult.cid,
        url: metadataResult.url,
        tokenId: i + 1,
      })
    }

    return {
      collectionCid: collectionResult.cid,
      collectionUrl: collectionResult.url,
      nftMetadata: nftResults,
    }
  }

  // Utility methods
  getGatewayUrl(cid: string, gatewayIndex: number = 0): string {
    const gateway = ipfsConfig.gateways[gatewayIndex]
    return `${gateway}${cid}`
  }

  getAllGatewayUrls(cid: string): string[] {
    return ipfsConfig.gateways.map(gateway => `${gateway}${cid}`)
  }

  isValidCID(cid: string): boolean {
    // Basic CID validation
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58}|B[A-Z2-7]{58}|z[1-9A-HJ-NP-Za-km-z]{48}|F[0-9A-F]{50})$/.test(cid)
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.helia) {
        await this.initialize()
      }
      
      // Try to get peer ID
      const peerId = this.helia.libp2p.peerId
      return !!peerId
    } catch (error) {
      console.error('IPFS connection test failed:', error)
      return false
    }
  }

  async getPeers(): Promise<string[]> {
    if (!this.helia) {
      await this.initialize()
    }

    try {
      const connections = this.helia.libp2p.getConnections()
      return connections.map((conn: any) => conn.remotePeer.toString())
    } catch (error) {
      console.error('Failed to get peers:', error)
      return []
    }
  }

  async getNodeInfo(): Promise<{
    peerId: string
    version: string
    peers: number
  }> {
    if (!this.helia) {
      await this.initialize()
    }

    try {
      const peerId = this.helia.libp2p.peerId.toString()
      const peers = await this.getPeers()
      
      return {
        peerId,
        version: '1.0.0', // Helia version
        peers: peers.length,
      }
    } catch (error) {
      console.error('Failed to get node info:', error)
      throw new Error('Failed to get node info')
    }
  }

  async stop(): Promise<void> {
    if (this.helia) {
      await this.helia.stop()
      this.helia = null
      this.fs = null
    }
  }
}