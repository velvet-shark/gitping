'use client'

import { useState } from 'react'
import { X, Plus, Github } from 'lucide-react'

interface AddRepositoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newSubscription?: any) => void
}

export default function AddRepositoryModal({ isOpen, onClose, onSuccess }: AddRepositoryModalProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoUrl.trim()) return

    setLoading(true)
    setError('')

    try {
      // Parse GitHub repository URL or owner/repo format
      let owner = ''
      let repo = ''

      if (repoUrl.includes('github.com')) {
        // Handle GitHub URLs like https://github.com/owner/repo
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i)
        if (match) {
          owner = match[1]
          repo = match[2].replace(/\.git$/, '') // Remove .git suffix if present
        }
      } else if (repoUrl.includes('/')) {
        // Handle owner/repo format
        const parts = repoUrl.trim().split('/')
        if (parts.length === 2) {
          owner = parts[0]
          repo = parts[1]
        }
      }

      if (!owner || !repo) {
        setError('Please enter a valid GitHub repository URL or owner/repo format')
        return
      }

      const token = localStorage.getItem('auth_token')
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gitping-api.modelarena.workers.dev'

      const response = await fetch(`${apiUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          repo: `${owner}/${repo}`,
          kind: 'release',
          filters: {
            stable_only: false,
            tags: [],
            prerelease: true
          },
          channels: ['telegram']
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add repository')
      }

      const result = await response.json()

      // Success
      setRepoUrl('')
      onSuccess(result)
      onClose()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Repository</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Repository URL or Owner/Repo
            </label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                id="repoUrl"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="e.g., facebook/react or https://github.com/facebook/react"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white placeholder-gray-500"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="text-sm text-gray-500 mb-4">
            <p className="font-medium mb-2">Notification settings:</p>
            <ul className="space-y-1">
              <li>• All releases (including pre-releases)</li>
              <li>• Sent via Telegram</li>
              <li>• Real-time notifications</li>
            </ul>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !repoUrl.trim()}
              className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Add Repository</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}