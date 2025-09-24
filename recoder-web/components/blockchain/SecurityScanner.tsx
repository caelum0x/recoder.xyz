'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield } from 'lucide-react'

export function SecurityScanner() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="h-5 w-5" />
          <span>Security Scanner</span>
        </CardTitle>
        <CardDescription>
          Scan smart contracts for vulnerabilities and security issues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          Security scanner interface coming soon...
        </div>
      </CardContent>
    </Card>
  )
}