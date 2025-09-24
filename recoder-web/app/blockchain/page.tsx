'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Dynamically import wallet-dependent components with no SSR
const WalletConnect = dynamic(() => import('@/components/blockchain/WalletConnect').then(mod => ({ default: mod.WalletConnect })), { ssr: false })
import { ContractDeployment } from '@/components/blockchain/ContractDeployment'
import { TokenSwap } from '@/components/blockchain/TokenSwap'
import { NFTMinting } from '@/components/blockchain/NFTMinting'
import { SecurityScanner } from '@/components/blockchain/SecurityScanner'
import { Portfolio } from '@/components/blockchain/Portfolio'
import { IPFSManager } from '@/components/blockchain/IPFSManager'
import { 
  Wallet, 
  Code, 
  ArrowLeftRight, 
  Image, 
  Shield, 
  BarChart3, 
  Database,
  Zap,
  Globe,
  Lock
} from 'lucide-react'
export default function BlockchainPage() {
  // Safe Web3 provider usage with fallbacks
  let isConnected = false
  let address = null
  let chainId = null
  let balance = null

  try {
    const { useWeb3 } = require('@/providers/Web3Provider')
    const web3Data = useWeb3()
    isConnected = web3Data.isConnected
    address = web3Data.address
    chainId = web3Data.chainId
    balance = web3Data.balance
  } catch (error) {
    // Web3 provider not available - use fallback values
  }
  const [activeTab, setActiveTab] = useState('overview')

  const features = [
    {
      id: 'deploy',
      title: 'Smart Contract Deployment',
      description: 'Deploy contracts across EVM, Solana, and NEAR',
      icon: Code,
      status: 'active',
    },
    {
      id: 'swap',
      title: 'Multi-Chain Token Swaps',
      description: 'Swap tokens across different blockchains',
      icon: ArrowLeftRight,
      status: 'active',
    },
    {
      id: 'nft',
      title: 'NFT Management',
      description: 'Mint and manage NFTs with IPFS integration',
      icon: Image,
      status: 'active',
    },
    {
      id: 'security',
      title: 'Security Scanning',
      description: 'Scan smart contracts for vulnerabilities',
      icon: Shield,
      status: 'active',
    },
    {
      id: 'portfolio',
      title: 'Portfolio Tracking',
      description: 'Track assets across multiple chains',
      icon: BarChart3,
      status: 'active',
    },
    {
      id: 'ipfs',
      title: 'IPFS Storage',
      description: 'Decentralized file storage and management',
      icon: Database,
      status: 'active',
    },
  ]

  const supportedChains = [
    { name: 'Ethereum', status: 'active', color: 'bg-blue-500' },
    { name: 'Polygon', status: 'active', color: 'bg-purple-500' },
    { name: 'BSC', status: 'active', color: 'bg-yellow-500' },
    { name: 'Arbitrum', status: 'active', color: 'bg-cyan-500' },
    { name: 'Solana', status: 'active', color: 'bg-green-500' },
    { name: 'NEAR', status: 'active', color: 'bg-teal-500' },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Blockchain Operations</h1>
            <p className="text-gray-600">
              Multi-chain deployment, DeFi integration, and decentralized operations
            </p>
          </div>
          <WalletConnect />
        </div>
        
        {isConnected && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Wallet className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Connected Address</p>
                    <p className="text-xs text-gray-500">{address}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Globe className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Chain ID</p>
                    <p className="text-xs text-gray-500">{chainId}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium">Balance</p>
                    <p className="text-xs text-gray-500">{balance} ETH</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="swap">Swap</TabsTrigger>
          <TabsTrigger value="nft">NFT</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="ipfs">IPFS</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <feature.icon className="h-8 w-8 text-blue-500" />
                    <Badge variant={feature.status === 'active' ? 'default' : 'secondary'}>
                      {feature.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setActiveTab(feature.id)}
                  >
                    Access Feature
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <span>Supported Blockchains</span>
              </CardTitle>
              <CardDescription>
                Deploy and interact with smart contracts across multiple chains
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {supportedChains.map((chain) => (
                  <div key={chain.name} className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${chain.color}`} />
                    <span className="font-medium">{chain.name}</span>
                    <Badge variant="outline" className="ml-auto">
                      {chain.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="h-5 w-5" />
                <span>Security & Best Practices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Automated security scanning for all deployments</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Real-time vulnerability detection</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Best practice recommendations</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-sm">Multi-signature wallet support</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deploy">
          <ContractDeployment />
        </TabsContent>

        <TabsContent value="swap">
          <TokenSwap />
        </TabsContent>

        <TabsContent value="nft">
          <NFTMinting />
        </TabsContent>

        <TabsContent value="security">
          <SecurityScanner />
        </TabsContent>

        <TabsContent value="portfolio">
          <Portfolio />
        </TabsContent>

        <TabsContent value="ipfs">
          <IPFSManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}