'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, ArrowRight, Loader } from 'lucide-react'

function CallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token')
      const errorParam = searchParams.get('error')

      if (errorParam) {
        setStatus('error')
        setError(decodeURIComponent(errorParam))
        return
      }

      if (!token) {
        setStatus('error')
        setError('No authentication token received')
        return
      }

      try {
        // Store the token in localStorage
        localStorage.setItem('auth_token', decodeURIComponent(token))

        // Fetch user data with the token to verify it's valid
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.vlvt.sh'
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: { 'Authorization': `Bearer ${decodeURIComponent(token)}` }
        })

        if (!response.ok) {
          throw new Error('Invalid token')
        }

        const userData = await response.json()
        if (userData.success && userData.user) {
          localStorage.setItem('user', JSON.stringify(userData.user))
        }

        setStatus('success')
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 2000)

      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Authentication failed')
        // Clear any stored data on error
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user')
      }
    }

    handleCallback()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Completing sign in...
            </h1>
            <p className="text-gray-600">
              Please wait while we set up your account
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Welcome to GitPing!
            </h1>
            <p className="text-gray-600 mb-6">
              Your account has been set up successfully. Redirecting to dashboard...
            </p>
            <Link 
              href="/dashboard"
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Failed
            </h1>
            <p className="text-gray-600 mb-6">
              {error}
            </p>
            <div className="space-y-3">
              <Link 
                href="/auth/login"
                className="block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </Link>
              <Link 
                href="/"
                className="block text-gray-600 hover:text-gray-900 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}