'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useWeb3 } from '@/providers/Web3Provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useNear } from '@/providers/NearProvider'
import { Wallet, ChevronDown, Copy, ExternalLink, Zap } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export function WalletConnect() {
  const [isConnecting, setIsConnecting] = useState(false)
  
  // EVM wallet (Ethereum, Polygon, etc.)
  const { 
    isConnected: evmConnected, 
    address: evmAddress, 
    connectWallet: connectEVM, 
    disconnectWallet: disconnectEVM,
    chainId,
    balance,
  } = useWeb3()
  
  // Solana wallet with safe fallbacks
  let solanaConnected = false
  let solanaAddress = null
  let disconnectSolana = () => {}
  let setVisible = (open: boolean) => {}

  try {
    const wallet = useWallet()
    const modal = useWalletModal()
    solanaConnected = wallet.connected
    solanaAddress = wallet.publicKey
    disconnectSolana = wallet.disconnect
    setVisible = modal.setVisible
  } catch (error) {
    // Wallet provider not available - use fallback values
  }
  
  // NEAR wallet
  const { 
    isConnected: nearConnected, 
    accountId: nearAddress, 
    signIn: connectNear, 
    signOut: disconnectNear 
  } = useNear()

  const handleConnectEVM = async () => {
    setIsConnecting(true)
    try {
      await connectEVM()
    } catch (error) {
      console.error('Failed to connect EVM wallet:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleConnectSolana = () => {
    setVisible(true)
  }

  const handleConnectNear = async () => {
    setIsConnecting(true)
    try {
      await connectNear()
    } catch (error) {
      console.error('Failed to connect NEAR wallet:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatAddress = (address: string) => {
    if (address.length > 20) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return address
  }

  const getChainName = (chainId: number) => {
    switch (chainId) {
      case 1: return 'Ethereum'
      case 137: return 'Polygon'
      case 56: return 'BSC'
      case 42161: return 'Arbitrum'
      default: return `Chain ${chainId}`
    }
  }

  const connectedWallets = [
    evmConnected && {
      type: 'EVM',
      address: evmAddress,
      network: chainId ? getChainName(chainId) : 'Unknown',
      balance: balance ? `${parseFloat(balance).toFixed(4)} ETH` : '0 ETH',
      disconnect: disconnectEVM,
    },
    solanaConnected && {
      type: 'Solana',
      address: solanaAddress?.toString(),
      network: 'Solana',
      balance: '0 SOL', // Would need to fetch actual balance
      disconnect: disconnectSolana,
    },
    nearConnected && {
      type: 'NEAR',
      address: nearAddress,
      network: 'NEAR',
      balance: '0 NEAR', // Would need to fetch actual balance
      disconnect: disconnectNear,
    },
  ].filter(Boolean) as Array<{
    type: string;
    address: any;
    network: string;
    balance: string;
    disconnect: () => Promise<void>;
  }>

  const hasConnectedWallets = connectedWallets.length > 0

  if (hasConnectedWallets) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center space-x-2">
            <Wallet className="h-4 w-4 text-green-500" />
            <span>{connectedWallets.length} Connected</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="p-2">
            <h3 className="font-semibold mb-3">Connected Wallets</h3>
            <div className="space-y-3">
              {connectedWallets.map((wallet, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">{wallet.type}</Badge>
                      <span className="text-sm font-medium">{wallet.network}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={wallet.disconnect}
                      className="text-red-500 hover:text-red-700"
                    >
                      Disconnect
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Address</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-xs font-mono">
                          {formatAddress(wallet.address)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(wallet.address)}
                          className="h-4 w-4 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Balance</span>
                      <span className="text-xs font-medium">{wallet.balance}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleConnectEVM}>
            <Zap className="h-4 w-4 mr-2" />
            Connect EVM Wallet
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleConnectSolana}>
            <Zap className="h-4 w-4 mr-2" />
            Connect Solana Wallet
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleConnectNear}>
            <Zap className="h-4 w-4 mr-2" />
            Connect NEAR Wallet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Wallet className="h-5 w-5" />
          <span>Connect Wallets</span>
        </CardTitle>
        <CardDescription>
          Connect your wallets to interact with multiple blockchains
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={handleConnectEVM}
          disabled={isConnecting}
          className="w-full flex items-center justify-between"
          variant="outline"
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" />
            <span>EVM Chains</span>
          </div>
          <Badge variant="secondary">Ethereum, Polygon, BSC</Badge>
        </Button>
        
        <Button
          onClick={handleConnectSolana}
          disabled={isConnecting}
          className="w-full flex items-center justify-between"
          variant="outline"
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-blue-500 rounded-full" />
            <span>Solana</span>
          </div>
          <Badge variant="secondary">Phantom, Solflare</Badge>
        </Button>
        
        <Button
          onClick={handleConnectNear}
          disabled={isConnecting}
          className="w-full flex items-center justify-between"
          variant="outline"
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full" />
            <span>NEAR Protocol</span>
          </div>
          <Badge variant="secondary">MyNear, Sender</Badge>
        </Button>
        
        {isConnecting && (
          <div className="text-center text-sm text-gray-500">
            Connecting wallet...
          </div>
        )}
      </CardContent>
    </Card>
  )
}