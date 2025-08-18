import Link from 'next/link'
import { GitBranch, Bell, Zap, Shield, Github } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-2">
              <GitBranch className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">GitPing</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                href="/auth/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In with GitHub
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Never Miss a 
            <span className="text-blue-600"> Release</span> Again
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Get instant notifications when your favorite GitHub repositories release new versions. 
            Stay updated on the tools and libraries you depend on.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link 
              href="/auth/login"
              className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Github className="h-5 w-5" />
              <span>Get Started with GitHub</span>
            </Link>
            <p className="text-sm text-gray-500">
              Free forever • No credit card required
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 bg-white rounded-xl shadow-lg">
            <Bell className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Real-time Notifications</h3>
            <p className="text-gray-600">
              Get notified instantly via Telegram when new releases are published. 
              No delays, no missed updates.
            </p>
          </div>
          <div className="text-center p-6 bg-white rounded-xl shadow-lg">
            <Zap className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Filters</h3>
            <p className="text-gray-600">
              Control what you want to hear about. Skip pre-releases, 
              filter by version patterns, and customize your preferences.
            </p>
          </div>
          <div className="text-center p-6 bg-white rounded-xl shadow-lg">
            <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Private</h3>
            <p className="text-gray-600">
              Built on Cloudflare's global network. Your data is encrypted, 
              and we never store your GitHub tokens.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How GitPing Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Connect GitHub</h3>
              <p className="text-gray-600">
                Sign in with your GitHub account to access public repositories
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Subscribe to Repos</h3>
              <p className="text-gray-600">
                Add repositories you want to track and configure your notification preferences
              </p>
            </div>
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Get Notified</h3>
              <p className="text-gray-600">
                Receive instant Telegram notifications when new releases are published
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center bg-white rounded-xl shadow-lg p-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to stay updated?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of developers who never miss important releases
          </p>
          <Link 
            href="/auth/login"
            className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors inline-flex items-center space-x-2"
          >
            <Github className="h-5 w-5" />
            <span>Start for Free</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GitBranch className="h-6 w-6" />
              <span className="text-xl font-bold">GitPing</span>
            </div>
            <div className="text-sm text-gray-400">
              Built with ❤️ using Cloudflare Workers
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}