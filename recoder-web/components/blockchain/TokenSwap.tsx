'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftRight, RefreshCw, Settings, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useWeb3 } from '@/providers/Web3Provider'
import { useWallet } from '@solana/wallet-adapter-react'

interface TokenInfo {
  symbol: string
  name: string
  address: string
  decimals: number
  logoURI?: string
}

export function TokenSwap() {
  const { isConnected, address, chainId, blockchainService } = useWeb3()
  const { connected: solanaConnected, publicKey } = useWallet()
  
  const [fromToken, setFromToken] = useState<TokenInfo | null>(null)
  const [toToken, setToToken] = useState<TokenInfo | null>(null)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [isSwapping, setIsSwapping] = useState(false)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [selectedBlockchain, setSelectedBlockchain] = useState('ethereum')
  const [slippage, setSlippage] = useState('0.5')

  const blockchains = [
    { id: 'ethereum', name: 'Ethereum', color: 'bg-blue-500' },
    { id: 'polygon', name: 'Polygon', color: 'bg-purple-500' },
    { id: 'bsc', name: 'BSC', color: 'bg-yellow-500' },
    { id: 'arbitrum', name: 'Arbitrum', color: 'bg-cyan-500' },
    { id: 'solana', name: 'Solana', color: 'bg-green-500' },
  ]

  const popularTokens = {
    ethereum: [
      { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
      { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86a33E6441d3c9c5B5cc3E4e4E3B9E7E5D8Ff', decimals: 6 },
      { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
    ],
    solana: [
      { symbol: 'SOL', name: 'Solana', address: 'So11111111111111111111111111111111111111112', decimals: 9 },
      { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
      { symbol: 'USDT', name: 'Tether', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
      { symbol: 'RAY', name: 'Raydium', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 },
    ],
  }

  const getQuote = async () => {
    if (!fromToken || !toToken || !fromAmount) return

    setIsLoadingQuote(true)
    try {
      if (selectedBlockchain === 'solana') {
        const solanaService = blockchainService.getService('solana') as any
        const quote = await solanaService.getJupiterQuote(
          fromToken.address,
          toToken.address,
          parseFloat(fromAmount) * Math.pow(10, fromToken.decimals),
          parseFloat(slippage) * 100
        )
        
        if (quote.outAmount) {
          const formattedAmount = (parseInt(quote.outAmount) / Math.pow(10, toToken.decimals)).toString()
          setToAmount(formattedAmount)
        }
      } else {
        // For EVM chains, simulate quote (would implement actual DEX integration)
        const mockQuote = parseFloat(fromAmount) * 0.998 // Mock 0.2% slippage
        setToAmount(mockQuote.toString())
      }
    } catch (error) {
      console.error('Failed to get quote:', error)
      toast.error('Failed to get swap quote')
    } finally {
      setIsLoadingQuote(false)
    }
  }

  const handleSwap = async () => {
    if (!fromToken || !toToken || !fromAmount || !toAmount) {
      toast.error('Please select tokens and enter amounts')
      return
    }

    if (!isConnected && selectedBlockchain !== 'solana') {
      toast.error('Please connect your wallet first')
      return
    }

    if (!solanaConnected && selectedBlockchain === 'solana') {
      toast.error('Please connect your Solana wallet first')
      return
    }

    setIsSwapping(true)
    try {
      const userAddress = selectedBlockchain === 'solana' ? publicKey?.toString() : address
      
      const result = await (blockchainService as any).swapTokens?.(
        selectedBlockchain as any,
        {
          tokenIn: fromToken.address,
          tokenOut: toToken.address,
          amountIn: fromAmount,
          minAmountOut: toAmount,
          userAddress: userAddress || '',
          slippage: parseFloat(slippage),
        },
        {
          chainId: selectedBlockchain === 'ethereum' ? (chainId ?? undefined) : undefined,
          network: selectedBlockchain === 'solana' ? 'mainnet' : undefined,
        }
      ) || { success: false, error: 'Token swap service not available' }

      if (result.success) {
        toast.success('Swap executed successfully!')
        setFromAmount('')
        setToAmount('')
      } else {
        toast.error(`Swap failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Swap error:', error)
      toast.error('Swap failed')
    } finally {
      setIsSwapping(false)
    }
  }

  const swapTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setFromAmount(toAmount)
    setToAmount('')
  }

  useEffect(() => {
    if (fromAmount && fromToken && toToken) {
      const timeoutId = setTimeout(() => {
        getQuote()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [fromAmount, fromToken, toToken, selectedBlockchain])

  const currentTokens = popularTokens[selectedBlockchain as keyof typeof popularTokens] || popularTokens.ethereum

  return (
    <div className="space-y-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ArrowLeftRight className="h-5 w-5" />
              <span>Token Swap</span>
            </div>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>
            Swap tokens across multiple blockchains with real-time pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Blockchain Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Blockchain</Label>
            <div className="grid grid-cols-3 gap-2">
              {blockchains.map((blockchain) => (
                <Button
                  key={blockchain.id}
                  variant={selectedBlockchain === blockchain.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedBlockchain(blockchain.id)}
                  className="flex items-center space-x-1"
                >
                  <div className={`w-2 h-2 rounded-full ${blockchain.color}`} />
                  <span className="text-xs">{blockchain.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* From Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">From</Label>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Select
                  value={fromToken?.symbol || ''}
                  onValueChange={(value) => {
                    const token = currentTokens.find((t: any) => t.symbol === value)
                    setFromToken(token || null)
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTokens.map((token) => (
                      <SelectItem key={token.symbol} value={token.symbol}>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{token.symbol}</span>
                          <span className="text-xs text-gray-500">{token.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="text-right border-0 text-lg font-medium"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Balance: 0.0</span>
                <span>~$0.00</span>
              </div>
            </div>
          </div>

          {/* Swap Direction */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={swapTokens}
              className="rounded-full p-2"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </div>

          {/* To Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">To</Label>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Select
                  value={toToken?.symbol || ''}
                  onValueChange={(value) => {
                    const token = currentTokens.find((t: any) => t.symbol === value)
                    setToToken(token || null)
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTokens.map((token) => (
                      <SelectItem key={token.symbol} value={token.symbol}>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{token.symbol}</span>
                          <span className="text-xs text-gray-500">{token.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-right">
                  {isLoadingQuote ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-lg font-medium">{toAmount || '0.0'}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Balance: 0.0</span>
                <span>~$0.00</span>
              </div>
            </div>
          </div>

          {/* Swap Details */}
          {fromToken && toToken && fromAmount && toAmount && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Exchange Rate</span>
                <span>1 {fromToken.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Price Impact</span>
                <Badge variant="outline" className="text-green-600">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  &lt;0.01%
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Slippage Tolerance</span>
                <span>{slippage}%</span>
              </div>
            </div>
          )}

          {/* Slippage Settings */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Slippage Tolerance</Label>
            <div className="flex space-x-2">
              {['0.1', '0.5', '1.0'].map((value) => (
                <Button
                  key={value}
                  variant={slippage === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSlippage(value)}
                >
                  {value}%
                </Button>
              ))}
              <Input
                type="number"
                placeholder="Custom"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-20 text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleSwap}
            disabled={!fromToken || !toToken || !fromAmount || !toAmount || isSwapping}
            className="w-full"
          >
            {isSwapping ? 'Swapping...' : 'Swap Tokens'}
          </Button>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Swaps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-gray-500">
            No recent swaps found. Connect your wallet to see transaction history.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}