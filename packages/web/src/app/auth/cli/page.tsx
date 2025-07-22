'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

function CLIAuthContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authStep, setAuthStep] = useState<'login' | 'register' | 'success'>('login')
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null)

  useEffect(() => {
    const callback = searchParams.get('callback')
    if (callback) {
      setCallbackUrl(callback)
    }
  }, [searchParams])

  const handleAuth = async (type: 'login' | 'register', email: string, password: string, username?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const payload = type === 'register' 
        ? { email, password, username } 
        : { email, password }

      const response = await fetch(`/api/auth/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `${type} failed`)
      }

      if (type === 'login' && callbackUrl) {
        // Generate auth code for CLI
        const authCode = await generateAuthCode(data.user.id)
        
        // Redirect back to CLI with auth code
        window.location.href = `${callbackUrl}?code=${authCode}`
      } else {
        setAuthStep('success')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : `${type} failed`)
    } finally {
      setIsLoading(false)
    }
  }

  const generateAuthCode = async (userId: string): Promise<string> => {
    const response = await fetch('/api/auth/cli/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'Failed to generate auth code')
    }

    return data.code
  }

  if (authStep === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Successful!</h2>
          <p className="text-gray-600 mb-6">You can now close this window and return to your terminal.</p>
          <p className="text-sm text-gray-500">
            If the window doesn't close automatically, you can close it manually.
          </p>
          <script dangerouslySetInnerHTML={{
            __html: `setTimeout(() => window.close(), 3000);`
          }} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Recoder.xyz
          </h1>
          <p className="text-gray-600">
            Authenticate your CLI session
          </p>
        </div>

        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setAuthStep('login')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              authStep === 'login'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setAuthStep('register')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              authStep === 'register'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <AuthForm
          type={authStep}
          onSubmit={handleAuth}
          isLoading={isLoading}
        />

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function AuthForm({
  type,
  onSubmit,
  isLoading,
}: {
  type: 'login' | 'register'
  onSubmit: (type: 'login' | 'register', email: string, password: string, username?: string) => void
  isLoading: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (type === 'register') {
      if (password !== confirmPassword) {
        alert('Passwords do not match')
        return
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters')
        return
      }
      if (!username.trim()) {
        alert('Username is required')
        return
      }
    }

    onSubmit(type, email, password, username)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter your email"
        />
      </div>

      {type === 'register' && (
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Choose a username"
            minLength={3}
          />
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter your password"
          minLength={8}
        />
      </div>

      {type === 'register' && (
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Confirm your password"
            minLength={8}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {type === 'login' ? 'Logging in...' : 'Creating account...'}
          </>
        ) : (
          type === 'login' ? 'Login' : 'Create Account'
        )}
      </button>
    </form>
  )
}

export default function CLIAuthPage() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <CLIAuthContent />
    </Suspense>
  )
}