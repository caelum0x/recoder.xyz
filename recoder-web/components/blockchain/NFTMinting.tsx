'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Image, Upload, Plus, X, ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useWeb3 } from '@/providers/Web3Provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { useNear } from '@/providers/NearProvider'

interface Attribute {
  trait_type: string
  value: string
}

interface NFTResult {
  success: boolean
  transactionHash?: string
  tokenId?: string
  mintAddress?: string
  error?: string
  metadataUrl?: string
}

export function NFTMinting() {
  const { isConnected, address, chainId, blockchainService } = useWeb3()
  const { connected: solanaConnected, publicKey } = useWallet()
  const { isConnected: nearConnected, accountId } = useNear()
  
  const [selectedBlockchain, setSelectedBlockchain] = useState('')
  const [selectedNetwork, setSelectedNetwork] = useState('')
  const [nftName, setNftName] = useState('')
  const [nftDescription, setNftDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [contractAddress, setContractAddress] = useState('')
  const [isMinting, setIsMinting] = useState(false)
  const [mintingProgress, setMintingProgress] = useState(0)
  const [mintResult, setMintResult] = useState<NFTResult | null>(null)

  const blockchains = [
    { id: 'evm', name: 'EVM Chains', networks: ['1', '137', '56', '42161'] },
    { id: 'solana', name: 'Solana', networks: ['mainnet', 'devnet', 'testnet'] },
    { id: 'near', name: 'NEAR Protocol', networks: ['mainnet', 'testnet'] },
  ]

  const networkNames = {
    '1': 'Ethereum',
    '137': 'Polygon',
    '56': 'BSC',
    '42161': 'Arbitrum',
    'mainnet': 'Mainnet',
    'devnet': 'Devnet',
    'testnet': 'Testnet',
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const addAttribute = () => {
    setAttributes([...attributes, { trait_type: '', value: '' }])
  }

  const updateAttribute = (index: number, field: 'trait_type' | 'value', value: string) => {
    const newAttributes = [...attributes]
    newAttributes[index][field] = value
    setAttributes(newAttributes)
  }

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index))
  }

  const handleMint = async () => {
    if (!selectedBlockchain || !nftName || !nftDescription || !imageFile) {
      toast.error('Please fill in all required fields and upload an image')
      return
    }

    // Check wallet connection based on blockchain
    if (selectedBlockchain === 'evm' && !isConnected) {
      toast.error('Please connect your EVM wallet first')
      return
    }
    if (selectedBlockchain === 'solana' && !solanaConnected) {
      toast.error('Please connect your Solana wallet first')
      return
    }
    if (selectedBlockchain === 'near' && !nearConnected) {
      toast.error('Please connect your NEAR wallet first')
      return
    }

    setIsMinting(true)
    setMintingProgress(0)
    setMintResult(null)

    try {
      // Step 1: Upload image to IPFS
      setMintingProgress(25)
      const ipfsService = (blockchainService as any).getIPFSService?.() || (blockchainService as any).getService?.('ipfs')
      const imageResult = await ipfsService.uploadNFTImage(imageFile)

      // Step 2: Create and upload metadata
      setMintingProgress(50)
      const metadata = {
        name: nftName,
        description: nftDescription,
        image: imageResult.ipfsUrl,
        attributes: attributes.filter(attr => attr.trait_type && attr.value),
      }
      const metadataResult = await ipfsService.uploadNFTMetadata(metadata)

      // Step 3: Mint NFT
      setMintingProgress(75)
      let userAddress = ''
      if (selectedBlockchain === 'evm') userAddress = address || ''
      if (selectedBlockchain === 'solana') userAddress = publicKey?.toString() || ''
      if (selectedBlockchain === 'near') userAddress = accountId || ''

      const nftData = {
        name: nftName,
        description: nftDescription,
        imageFile,
        userAddress,
        contractAddress,
        attributes: attributes.filter(attr => attr.trait_type && attr.value),
      }

      const networkConfig = {
        chainId: selectedBlockchain === 'evm' ? (chainId || parseInt(selectedNetwork)) : undefined,
        network: selectedBlockchain !== 'evm' ? selectedNetwork : undefined,
      }

      const result = await (blockchainService as any).mintNFT?.(
        selectedBlockchain as any,
        nftData,
        networkConfig
      ) || { success: false, error: 'NFT minting service not available' }

      setMintingProgress(100)
      setMintResult({
        ...result,
        metadataUrl: metadataResult.url,
      })

      if (result.success) {
        toast.success('NFT minted successfully!')
        // Reset form
        setNftName('')
        setNftDescription('')
        setImageFile(null)
        setImagePreview(null)
        setAttributes([])
      } else {
        toast.error(`Minting failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Minting error:', error)
      setMintResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error('Minting failed')
    } finally {
      setIsMinting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Image className="h-5 w-5" />
            <span>NFT Minting</span>
          </CardTitle>
          <CardDescription>
            Mint NFTs across multiple blockchains with automatic IPFS storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - NFT Details */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="blockchain">Blockchain</Label>
                <Select value={selectedBlockchain} onValueChange={setSelectedBlockchain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select blockchain" />
                  </SelectTrigger>
                  <SelectContent>
                    {blockchains.map((blockchain) => (
                      <SelectItem key={blockchain.id} value={blockchain.id}>
                        {blockchain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBlockchain && (
                <div>
                  <Label htmlFor="network">Network</Label>
                  <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      {blockchains
                        .find(b => b.id === selectedBlockchain)
                        ?.networks.map((network) => (
                          <SelectItem key={network} value={network}>
                            {networkNames[network as keyof typeof networkNames] || network}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedBlockchain === 'evm' && (
                <div>
                  <Label htmlFor="contractAddress">Contract Address (Optional)</Label>
                  <Input
                    id="contractAddress"
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    placeholder="0x... (leave empty for default contract)"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="nftName">NFT Name</Label>
                <Input
                  id="nftName"
                  value={nftName}
                  onChange={(e) => setNftName(e.target.value)}
                  placeholder="Enter NFT name"
                />
              </div>

              <div>
                <Label htmlFor="nftDescription">Description</Label>
                <Textarea
                  id="nftDescription"
                  value={nftDescription}
                  onChange={(e) => setNftDescription(e.target.value)}
                  placeholder="Describe your NFT..."
                  className="h-24"
                />
              </div>

              {/* Attributes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Attributes</Label>
                  <Button onClick={addAttribute} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Attribute
                  </Button>
                </div>
                <div className="space-y-2">
                  {attributes.map((attribute, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        placeholder="Trait type"
                        value={attribute.trait_type}
                        onChange={(e) => updateAttribute(index, 'trait_type', e.target.value)}
                      />
                      <Input
                        placeholder="Value"
                        value={attribute.value}
                        onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                      />
                      <Button
                        onClick={() => removeAttribute(index)}
                        size="sm"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Image Upload & Preview */}
            <div className="space-y-4">
              <div>
                <Label>NFT Image</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="NFT Preview"
                        className="w-full h-64 object-cover rounded-lg"
                      />
                      <Button
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                        }}
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="mt-4">
                        <Label htmlFor="image-upload" className="cursor-pointer">
                          <span className="mt-2 block text-sm font-medium text-gray-900">
                            Upload an image
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            PNG, JPG, GIF up to 10MB
                          </span>
                        </Label>
                        <Input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Card */}
              {imagePreview && nftName && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">NFT Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <h3 className="font-semibold">{nftName}</h3>
                      <p className="text-sm text-gray-600">{nftDescription}</p>
                      {attributes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {attributes
                            .filter(attr => attr.trait_type && attr.value)
                            .map((attribute, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {attribute.trait_type}: {attribute.value}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Minting Progress */}
          {isMinting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Minting Progress</span>
                <span className="text-sm text-gray-500">{mintingProgress}%</span>
              </div>
              <Progress value={mintingProgress} className="w-full" />
              <div className="text-xs text-gray-500">
                {mintingProgress <= 25 && 'Preparing metadata...'}
                {mintingProgress > 25 && mintingProgress <= 50 && 'Uploading to IPFS...'}
                {mintingProgress > 50 && mintingProgress <= 75 && 'Creating metadata...'}
                {mintingProgress > 75 && 'Minting NFT...'}
              </div>
            </div>
          )}

          {/* Mint Result */}
          {mintResult && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Badge variant={mintResult.success ? 'default' : 'destructive'}>
                      {mintResult.success ? 'Success' : 'Failed'}
                    </Badge>
                    <span className="font-medium">
                      {mintResult.success ? 'NFT Minted Successfully' : 'Minting Failed'}
                    </span>
                  </div>

                  {mintResult.success ? (
                    <div className="space-y-2">
                      {mintResult.transactionHash && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Transaction:</span>
                          <div className="flex items-center space-x-1">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {mintResult.transactionHash.slice(0, 20)}...
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(mintResult.transactionHash!)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {mintResult.tokenId && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Token ID:</span>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {mintResult.tokenId}
                          </code>
                        </div>
                      )}

                      {mintResult.mintAddress && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Mint Address:</span>
                          <div className="flex items-center space-x-1">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {mintResult.mintAddress.slice(0, 20)}...
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(mintResult.mintAddress!)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {mintResult.metadataUrl && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Metadata:</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(mintResult.metadataUrl, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-red-600">
                      {mintResult.error}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleMint}
            disabled={!selectedBlockchain || !nftName || !nftDescription || !imageFile || isMinting}
            className="w-full"
          >
            {isMinting ? 'Minting...' : 'Mint NFT'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}