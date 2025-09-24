'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'

export function Portfolio() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <BarChart3 className="h-5 w-5" />
          <span>Portfolio Tracker</span>
        </CardTitle>
        <CardDescription>
          Track your assets across multiple blockchains
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          Portfolio tracking interface coming soon...
        </div>
      </CardContent>
    </Card>
  )
}