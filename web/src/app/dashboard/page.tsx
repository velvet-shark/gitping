'use client'

import { useEffect, useState } from 'react'
import { Bell, Plus, Settings, LogOut, MessageSquare, Copy, Trash2 } from 'lucide-react'
import Link from 'next/link'
import AddRepositoryModal from '../../components/AddRepositoryModal'

interface User {
  id: string
  name: string
  github_username: string
  avatar_url: string
  email?: string
  tg_chat_id?: string
}

interface Subscription {
  id: number
  repo: string
  kind: string
  filters: any
  channels: any[]
  created_at: number
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [connectionCode, setConnectionCode] = useState('')
  const [showConnectionCode, setShowConnectionCode] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showAddRepo, setShowAddRepo] = useState(false)

  const loadUserData = async (skipCache = false) => {
    try {
      if (!skipCache) {
        // Try to load user from localStorage first
        const savedUser = localStorage.getItem('user')
        if (savedUser) {
          setUser(JSON.parse(savedUser))
        }
      }

      // Check if we have a token
      const token = localStorage.getItem('auth_token')
      if (!token) {
        window.location.href = '/auth/login'
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.modelarena.workers.dev'
      
      // Fetch current user data and subscriptions
      const [userResponse, subscriptionsResponse] = await Promise.all([
        fetch(`${apiUrl}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/subscriptions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ])

      if (!userResponse.ok) {
        // Token invalid, clear storage and redirect
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user')
        window.location.href = '/auth/login'
        return
      }

      const userData = await userResponse.json()
      setUser(userData.user)
      localStorage.setItem('user', JSON.stringify(userData.user))

      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json()
        setSubscriptions(subscriptionsData)
      } else {
        console.error('Failed to load subscriptions:', await subscriptionsResponse.text())
      }

    } catch (error) {
      console.error('Failed to load user data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const refreshUserData = async () => {
    setRefreshing(true)
    await loadUserData(true) // Skip cache to get fresh data
  }

  useEffect(() => {
    loadUserData()
  }, [])

  const generateConnectionCode = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.modelarena.workers.dev'
      
      const response = await fetch(`${apiUrl}/auth/connection-code`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        setConnectionCode(data.code)
        setShowConnectionCode(true)
      }
    } catch (error) {
      console.error('Failed to generate connection code:', error)
    }
  }

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.modelarena.workers.dev'
      
      // Call logout endpoint to clear server-side session
      await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear local storage and redirect
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      window.location.href = '/'
    }
  }

  const copyConnectionCode = () => {
    navigator.clipboard.writeText(connectionCode)
  }

  const handleAddRepository = () => {
    setShowAddRepo(true)
  }

  const handleAddRepoSuccess = () => {
    // Refresh subscriptions after adding a new repository
    refreshUserData()
  }

  const handleDeleteSubscription = async (subscriptionId: number, repoName: string) => {
    if (!confirm(`Are you sure you want to unsubscribe from ${repoName}?`)) {
      return
    }

    try {
      const token = localStorage.getItem('auth_token')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.modelarena.workers.dev'

      const response = await fetch(`${apiUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete subscription')
      }

      // Refresh subscriptions after deletion
      refreshUserData()
    } catch (error) {
      console.error('Failed to delete subscription:', error)
      alert('Failed to delete subscription. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please sign in to access your dashboard</p>
          <Link href="/auth/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <img 
                src={user.avatar_url} 
                alt={user.name}
                className="h-10 w-10 rounded-full"
              />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Welcome back, {user.name}
                </h1>
                <p className="text-sm text-gray-500">@{user.github_username}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user.tg_chat_id ? (
                <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg">
                  <MessageSquare className="h-4 w-4" />
                  <span>Telegram Connected</span>
                </div>
              ) : (
                <button
                  onClick={generateConnectionCode}
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Connect Telegram</span>
                </button>
              )}
              <button
                onClick={refreshUserData}
                disabled={refreshing}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                <Settings className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Connection Code Modal */}
        {showConnectionCode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Connect Telegram
              </h3>
              <p className="text-gray-600 mb-4">
                Send this code to the GitPing Telegram bot to link your accounts:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold">{connectionCode}</span>
                  <button
                    onClick={copyConnectionCode}
                    className="p-2 text-gray-500 hover:text-gray-700"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-500 mb-4">
                <p>1. Open Telegram and find the GitPing bot</p>
                <p>2. Send: <code className="bg-gray-100 px-1 rounded">/connect {connectionCode}</code></p>
                <p>3. The code expires in 10 minutes</p>
              </div>
              <button
                onClick={() => setShowConnectionCode(false)}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Bell className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">{subscriptions.length}</p>
                <p className="text-gray-600">Active Subscriptions</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <MessageSquare className={`h-8 w-8 ${user.tg_chat_id ? 'text-green-600' : 'text-gray-400'}`} />
              <div className="ml-4">
                <p className={`text-2xl font-bold ${user.tg_chat_id ? 'text-green-600' : 'text-gray-400'}`}>
                  {user.tg_chat_id ? '✓' : '✗'}
                </p>
                <p className="text-gray-600">Telegram Connected</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Settings className="h-8 w-8 text-gray-600" />
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900">1</p>
                <p className="text-gray-600">Notification Channels</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subscriptions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Your Subscriptions</h2>
              <button 
                onClick={handleAddRepository}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Repository</span>
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {subscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No subscriptions yet</h3>
                <p className="text-gray-600 mb-6">
                  Start by subscribing to repositories you want to track for new releases.
                </p>
                <button 
                  onClick={handleAddRepository}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Subscribe to Your First Repository
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">{sub.repo}</h3>
                      <p className="text-sm text-gray-600">
                        {sub.kind} notifications • {sub.channels.length} channel(s)
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteSubscription(sub.id, sub.repo)}
                        className="text-red-400 hover:text-red-600"
                        title="Delete subscription"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Repository Modal */}
      <AddRepositoryModal
        isOpen={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onSuccess={handleAddRepoSuccess}
      />
    </div>
  )
}