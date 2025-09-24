'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import SolidityIDE with no SSR to avoid window reference issues
const SolidityIDE = dynamic(() => import('./components/SolidityIDE'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
    </div>
  )
})

export default function SolidityIDEPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    }>
      <SolidityIDE />
    </Suspense>
  )
}