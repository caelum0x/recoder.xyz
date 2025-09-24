'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database } from 'lucide-react'

export function IPFSManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Database className="h-5 w-5" />
          <span>IPFS Manager</span>
        </CardTitle>
        <CardDescription>
          Manage decentralized file storage with IPFS
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-gray-500">
          IPFS management interface coming soon...
        </div>
      </CardContent>
    </Card>
  )
}