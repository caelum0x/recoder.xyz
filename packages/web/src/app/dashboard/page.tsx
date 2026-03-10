'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Zap, 
  MessageSquare, 
  TrendingUp, 
  Calendar,
  CreditCard,
  Settings,
  Download,
  ExternalLink
} from 'lucide-react'

interface UserData {
  id: string
  email: string
  plan: 'free' | 'premium' | 'pro' | 'enterprise'
  usage: {
    tokensUsed: number
    requestsUsed: number
    tokensLimit: number
    requestsLimit: number
    resetDate: string
  }
  subscriptionStatus?: 'active' | 'past_due' | 'canceled'
  lastPaymentDate?: string
}

interface UsageStats {
  dailyUsage: Array<{
    date: string
    tokens: number
    requests: number
    cost: number
  }>
  topFeatures: Array<{
    feature: string
    usage: number
    percentage: number
  }>
  estimatedMonthlyCost: number
}

export default function DashboardPage() {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserData()
    fetchUsageStats()
  }, [])

  const fetchUserData = async () => {
    try {
      // This would fetch from your API
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUserData(data)
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    }
  }

  const fetchUsageStats = async () => {
    try {
      // Mock data for demo
      setUsageStats({
        dailyUsage: [
          { date: '2024-01-15', tokens: 15000, requests: 45, cost: 0.21 },
          { date: '2024-01-16', tokens: 22000, requests: 62, cost: 0.31 },
          { date: '2024-01-17', tokens: 18500, requests: 38, cost: 0.26 },
          { date: '2024-01-18', tokens: 31000, requests: 89, cost: 0.43 },
          { date: '2024-01-19', tokens: 12000, requests: 28, cost: 0.17 }
        ],
        topFeatures: [
          { feature: 'Code Generation', usage: 145000, percentage: 65 },
          { feature: 'Web Agent', usage: 54000, percentage: 24 },
          { feature: 'Blockchain Agent', usage: 25000, percentage: 11 }
        ],
        estimatedMonthlyCost: 12.50
      })
    } catch (error) {
      console.error('Failed to fetch usage stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const upgradeToStripe = async (planType: 'premium' | 'pro') => {
    try {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ planType })
      })

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Failed to create checkout:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please log in to access your dashboard</p>
          <Button onClick={() => window.location.href = '/auth/login'}>
            Log In
          </Button>
        </div>
      </div>
    )
  }

  const tokenUsagePercentage = userData.usage.tokensLimit > 0 
    ? (userData.usage.tokensUsed / userData.usage.tokensLimit) * 100 
    : 0

  const requestUsagePercentage = userData.usage.requestsLimit > 0
    ? (userData.usage.requestsUsed / userData.usage.requestsLimit) * 100
    : 0

  const resetDate = new Date(userData.usage.resetDate).toLocaleDateString()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Recoder.xyz Dashboard</h1>
              <p className="text-gray-600">Welcome back, {userData.email}</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge 
                variant={userData.plan === 'free' ? 'secondary' : 'default'}
                className="capitalize"
              >
                {userData.plan} Plan
              </Badge>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Usage Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userData.usage.tokensUsed.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {userData.usage.tokensLimit > 0 
                  ? `of ${userData.usage.tokensLimit.toLocaleString()} limit`
                  : 'Unlimited with local models'
                }
              </div>
              {userData.usage.tokensLimit > 0 && (
                <Progress value={tokenUsagePercentage} className="mt-2" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Requests</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userData.usage.requestsUsed.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {userData.usage.requestsLimit > 0 
                  ? `of ${userData.usage.requestsLimit.toLocaleString()} limit`
                  : 'Unlimited with local models'
                }
              </div>
              {userData.usage.requestsLimit > 0 && (
                <Progress value={requestUsagePercentage} className="mt-2" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${usageStats?.estimatedMonthlyCost.toFixed(2) || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground">
                Estimated this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Reset</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resetDate}</div>
              <p className="text-xs text-muted-foreground">
                Usage limits reset
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Plan Management */}
        {userData.plan === 'free' && (
          <Card className="mb-8 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-900">Unlock Premium Features</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700 mb-4">
                Upgrade to access cloud AI models, advanced agents, and production-ready code generation.
              </p>
              <div className="flex space-x-4">
                <Button 
                  onClick={() => upgradeToStripe('premium')}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Premium - $20/month
                </Button>
                <Button 
                  onClick={() => upgradeToStripe('pro')}
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Pro - $100/month
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Usage Warnings */}
        {(tokenUsagePercentage > 80 || requestUsagePercentage > 80) && (
          <Card className="mb-8 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="text-yellow-800">
                  ⚠️ <strong>High Usage Alert:</strong> You've used {Math.max(tokenUsagePercentage, requestUsagePercentage).toFixed(0)}% of your monthly limits.
                </div>
              </div>
              {userData.plan === 'premium' && (
                <Button 
                  onClick={() => upgradeToStripe('pro')}
                  className="mt-3"
                  size="sm"
                >
                  Upgrade to Pro (5x more usage)
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Feature Usage */}
          <Card>
            <CardHeader>
              <CardTitle>Top Features Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageStats?.topFeatures.map((feature) => (
                  <div key={feature.feature} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{feature.feature}</p>
                      <p className="text-sm text-gray-600">{feature.usage.toLocaleString()} tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{feature.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button className="w-full justify-start" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download CLI
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  API Documentation
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Join Discord Community
                </Button>
                <Button 
                  className="w-full justify-start" 
                  variant="outline"
                  onClick={() => window.location.href = '/pricing'}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Manage Billing
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CLI Usage Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Using the CLI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
              <div># Install the CLI</div>
              <div>npm install -g recoder-code</div>
              <div className="mt-2"># Login to your account</div>
              <div>recoder auth login</div>
              <div className="mt-2"># Generate code naturally</div>
              <div>recoder "build a React dashboard with real-time data"</div>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              The CLI will automatically use your premium features and track usage against your subscription limits.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}