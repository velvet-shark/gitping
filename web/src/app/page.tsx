"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { GitBranch, Bell, Zap, Shield, Github, User } from "lucide-react";

interface User {
  id: string;
  name: string;
  github_username: string;
  avatar_url: string;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setLoading(false);
          return;
        }

        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Image
                src="/gitping-logo.png"
                alt="GitPing Logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg"
              />
              <span className="text-xl font-semibold text-gray-900">GitPing</span>
            </div>
            <div className="flex items-center space-x-3">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-8 w-16"></div>
              ) : user ? (
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  <User className="h-3 w-3" />
                  <span>Dashboard</span>
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Never miss a <span className="text-green-600">release</span>
          </h1>
          <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto leading-relaxed">
            Get instant notifications when your favorite GitHub repositories release new versions. 
            Stay updated on the tools and libraries you depend on.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/auth/login"
              className="bg-green-600 text-white px-6 py-3 border border-green-700 hover:bg-green-700 transition-colors flex items-center space-x-2 font-medium"
            >
              <Github className="h-4 w-4" />
              <span>Sign up for free</span>
            </Link>
            <p className="text-sm text-gray-600">Free forever • No credit card required</p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-white border border-gray-200">
            <Bell className="h-8 w-8 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Real-time notifications</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              Get notified instantly via Telegram when new releases are published. No delays, no missed updates.
            </p>
          </div>
          <div className="p-6 bg-white border border-gray-200">
            <Zap className="h-8 w-8 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Smart filters</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              Control what you want to hear about. Skip pre-releases, filter by version patterns, and customize your preferences.
            </p>
          </div>
          <div className="p-6 bg-white border border-gray-200">
            <Shield className="h-8 w-8 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Secure & private</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              Built on Cloudflare's global network. Your data is encrypted, and we never store your GitHub tokens.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-20">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-green-100 border border-green-200 w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <span className="text-lg font-bold text-green-700">1</span>
              </div>
              <h3 className="text-base font-semibold mb-2 text-gray-900">Connect GitHub</h3>
              <p className="text-gray-700 text-sm">Sign in with your GitHub account to access public repositories</p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 border border-green-200 w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <span className="text-lg font-bold text-green-700">2</span>
              </div>
              <h3 className="text-base font-semibold mb-2 text-gray-900">Subscribe to repos</h3>
              <p className="text-gray-700 text-sm">
                Add repositories you want to track and configure your notification preferences
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 border border-green-200 w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <span className="text-lg font-bold text-green-700">3</span>
              </div>
              <h3 className="text-base font-semibold mb-2 text-gray-900">Get notified</h3>
              <p className="text-gray-700 text-sm">Receive instant Telegram notifications when new releases are published</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center bg-white border border-gray-200 p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
          <p className="text-lg text-gray-700 mb-8">Join developers who never miss important releases</p>
          <Link
            href="/auth/login"
            className="bg-green-600 text-white px-6 py-3 border border-green-700 hover:bg-green-700 transition-colors inline-flex items-center space-x-2 font-medium"
          >
            <Github className="h-4 w-4" />
            <span>Sign up for free</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image src="/gitping-logo.png" alt="GitPing Logo" width={24} height={24} className="h-6 w-6 rounded-lg" />
              <span className="text-lg font-semibold text-gray-900">GitPing</span>
            </div>
            <div className="text-sm text-gray-600">Built with Cloudflare Workers</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
