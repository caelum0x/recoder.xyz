import { Suspense } from 'react'
import GameDevelopmentDashboard from './components/GameDevelopmentDashboard'

export default function GameDevelopmentPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Game Development</h1>
          <p className="mt-2 text-gray-600">
            Create and manage Unity and Unreal Engine projects with AI-powered code generation
          </p>
        </div>
        
        <Suspense fallback={<div>Loading...</div>}>
          <GameDevelopmentDashboard />
        </Suspense>
      </div>
    </div>
  )
}